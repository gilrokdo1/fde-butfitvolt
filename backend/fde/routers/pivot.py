"""피벗 분석 도구 — 쿼리 실행 + 저장 쿼리 CRUD"""

import re
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter()

# ---------------------------------------------------------------------------
# 쿼리 실행
# ---------------------------------------------------------------------------

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


class QueryRequest(BaseModel):
    sql: str


@router.post("/query")
def run_query(body: QueryRequest):
    sql = body.sql.strip()
    if not sql:
        raise HTTPException(400, "SQL이 비어있습니다")
    if _FORBIDDEN.search(sql):
        raise HTTPException(403, "SELECT 쿼리만 허용됩니다")

    try:
        with safe_db("replica") as (conn, cur):
            cur.execute(sql)
            columns = [desc[0] for desc in cur.description] if cur.description else []
            raw_rows = cur.fetchall()
            rows = [dict(r) for r in raw_rows]
    except Exception as e:
        raise HTTPException(400, f"쿼리 실행 오류: {str(e)}")

    return {"columns": columns, "rows": rows}


# ---------------------------------------------------------------------------
# 저장 쿼리 CRUD
# ---------------------------------------------------------------------------

class SavedQueryCreate(BaseModel):
    name: str
    description: str = ""
    sql: str


class SavedQueryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sql: str | None = None


def _ensure_table():
    """yewon_saved_queries 테이블이 없으면 생성"""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            CREATE TABLE IF NOT EXISTS yewon_saved_queries (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT DEFAULT '',
                sql TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)


@router.get("/queries")
def list_queries():
    _ensure_table()
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT id, name, description, sql, created_at, updated_at "
            "FROM yewon_saved_queries ORDER BY updated_at DESC"
        )
        return [dict(r) for r in cur.fetchall()]


@router.post("/queries")
def create_query(body: SavedQueryCreate):
    _ensure_table()
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "INSERT INTO yewon_saved_queries (name, description, sql) "
            "VALUES (%s, %s, %s) RETURNING id, name, description, sql, created_at",
            (body.name, body.description, body.sql),
        )
        return dict(cur.fetchone())


@router.put("/queries/{query_id}")
def update_query(query_id: int, body: SavedQueryUpdate):
    _ensure_table()
    fields = []
    values = []
    if body.name is not None:
        fields.append("name = %s")
        values.append(body.name)
    if body.description is not None:
        fields.append("description = %s")
        values.append(body.description)
    if body.sql is not None:
        fields.append("sql = %s")
        values.append(body.sql)
    if not fields:
        raise HTTPException(400, "수정할 항목이 없습니다")

    fields.append("updated_at = %s")
    values.append(datetime.now())
    values.append(query_id)

    with safe_db("fde") as (conn, cur):
        cur.execute(
            f"UPDATE yewon_saved_queries SET {', '.join(fields)} WHERE id = %s RETURNING *",
            values,
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "쿼리를 찾을 수 없습니다")
        return dict(row)


@router.delete("/queries/{query_id}")
def delete_query(query_id: int):
    _ensure_table()
    with safe_db("fde") as (conn, cur):
        cur.execute("DELETE FROM yewon_saved_queries WHERE id = %s", (query_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "쿼리를 찾을 수 없습니다")
    return {"ok": True}
