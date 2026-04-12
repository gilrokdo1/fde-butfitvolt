from fastapi import APIRouter, HTTPException

from utils.db import safe_db

router = APIRouter()


@router.get("")
def get_ranking():
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name, github_username, problem_score, score_reason,
                   github_stats, visit_count, evaluated_at, updated_at
            FROM member_scores
            ORDER BY problem_score DESC, member_name ASC
        """)
        rows = cur.fetchall()

    ranking = []
    for i, row in enumerate(rows, 1):
        entry = dict(row)
        entry["rank"] = i
        ranking.append(entry)
    return {"ranking": ranking}


@router.get("/{member_name}")
def get_member_detail(member_name: str):
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT * FROM member_scores WHERE member_name = %s",
            (member_name,),
        )
        member = cur.fetchone()

    if not member:
        raise HTTPException(404, f"멤버를 찾을 수 없습니다: {member_name}")

    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT problem_score, score_reason, evaluated_at FROM score_history WHERE member_name = %s ORDER BY evaluated_at DESC LIMIT 30",
            (member_name,),
        )
        history = cur.fetchall()

    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_visitors FROM page_visits WHERE page_path LIKE %s",
            (f"/fde/{member_name}%",),
        )
        visits = cur.fetchone()

    return {
        "member": dict(member),
        "history": [dict(h) for h in history],
        "visits": dict(visits) if visits else {"total": 0, "unique_visitors": 0},
    }
