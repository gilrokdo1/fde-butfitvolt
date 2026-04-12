from fastapi import APIRouter, Request
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter()


class VisitRequest(BaseModel):
    page_path: str


@router.post("/visit")
def record_visit(body: VisitRequest, request: Request):
    user = request.state.user
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "INSERT INTO page_visits (user_id, user_name, page_path) VALUES (%s, %s, %s)",
            (user["user_id"], user["name"], body.page_path),
        )
    return {"ok": True}


@router.get("/stats")
def visit_stats():
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT page_path, COUNT(*) as visit_count,
                   COUNT(DISTINCT user_id) as unique_visitors
            FROM page_visits
            WHERE page_path LIKE '/fde/%'
            GROUP BY page_path
            ORDER BY visit_count DESC
        """)
        rows = cur.fetchall()
    return {"stats": [dict(r) for r in rows]}
