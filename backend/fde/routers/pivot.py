"""피벗 분석 도구 — 쿼리 실행 + 저장 쿼리 CRUD"""

import re
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter()

# ---------------------------------------------------------------------------
# 쿼리 실행 (인증 필수 — auth middleware가 자동 적용)
# ---------------------------------------------------------------------------

# 위험 키워드 — 단어 경계로 매칭
_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|"
    r"EXECUTE|EXEC|CALL|DO|COPY|VACUUM|REINDEX|LOCK|NOTIFY|LISTEN|"
    r"SET|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|SECURITY)\b",
    re.IGNORECASE,
)

# SQL 주석 제거 (-- 라인 / /* 블록 */) — 우회 방지
_COMMENT_LINE = re.compile(r"--[^\n]*")
_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)

# 결과 행 제한 — 메모리 보호
MAX_ROWS = 500_000


class QueryRequest(BaseModel):
    sql: str


def _sanitize_for_check(sql: str) -> str:
    """주석 제거한 뒤 키워드 검사용 문자열 생성"""
    s = _COMMENT_BLOCK.sub(" ", sql)
    s = _COMMENT_LINE.sub(" ", s)
    return s


@router.post("/query")
def run_query(body: QueryRequest):
    sql = body.sql.strip()
    if not sql:
        raise HTTPException(400, "SQL이 비어있습니다")

    check_sql = _sanitize_for_check(sql)

    # SELECT / WITH 로만 시작해야 함
    if not re.match(r"^\s*(SELECT|WITH)\b", check_sql, re.IGNORECASE):
        raise HTTPException(403, "SELECT 또는 WITH 쿼리만 허용됩니다")

    # 세미콜론은 단일 쿼리 끝에만 허용 (멀티 스테이트먼트 차단)
    stripped = check_sql.rstrip().rstrip(";").rstrip()
    if ";" in stripped:
        raise HTTPException(403, "여러 구문은 허용되지 않습니다")

    # 위험 키워드 차단
    if _FORBIDDEN.search(check_sql):
        raise HTTPException(403, "사용할 수 없는 키워드가 포함되어 있습니다")

    try:
        with safe_db("replica") as (conn, cur):
            cur.execute(sql)
            columns = [desc[0] for desc in cur.description] if cur.description else []
            rows = []
            for i, r in enumerate(cur):
                if i >= MAX_ROWS:
                    break
                rows.append(dict(r))
    except HTTPException:
        raise
    except Exception:
        # DB 내부 구조 노출 방지 — 일반 메시지만 반환
        raise HTTPException(400, "쿼리 실행에 실패했습니다. SQL 문법을 확인해주세요.")

    return {"columns": columns, "rows": rows, "truncated": len(rows) >= MAX_ROWS}


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


# UPDATE 허용 컬럼 whitelist
_ALLOWED_UPDATE_FIELDS = {"name", "description", "sql"}


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

    updates: dict[str, str] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if body.sql is not None:
        updates["sql"] = body.sql

    if not updates:
        raise HTTPException(400, "수정할 항목이 없습니다")

    # 컬럼명 whitelist 검증 (이중 방어)
    for field in updates:
        if field not in _ALLOWED_UPDATE_FIELDS:
            raise HTTPException(400, f"허용되지 않는 필드: {field}")

    # 안전한 SQL 조립 — 컬럼명은 whitelist 통과한 것만
    set_parts = [f"{field} = %s" for field in updates] + ["updated_at = %s"]
    values = list(updates.values()) + [datetime.now(), query_id]
    sql = f"UPDATE yewon_saved_queries SET {', '.join(set_parts)} WHERE id = %s RETURNING *"

    with safe_db("fde") as (conn, cur):
        cur.execute(sql, values)
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
