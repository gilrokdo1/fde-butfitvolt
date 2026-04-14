from fastapi import APIRouter, HTTPException

from utils.db import safe_db

router = APIRouter()


SLUG_TO_NAME = {
    'do-gilrok': '도길록',
    'kim-dongha': '김동하',
    'kim-soyeon': '김소연',
    'kim-youngshin': '김영신',
    'park-mingyu': '박민규',
    'lee-yewon': '이예원',
    'choi-jihee': '최지희',
    'choi-chihwan': '최치환',
}


@router.get("")
def get_ranking():
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT ms.member_name, ms.github_username, ms.problem_score, ms.score_reason,
                   ms.github_stats, ms.evaluated_at, ms.updated_at,
                   COALESCE(pv.visit_count, 0) AS visit_count
            FROM member_scores ms
            LEFT JOIN (
                SELECT
                    CASE
                        WHEN page_path LIKE '/fde/do-gilrok%%' THEN '도길록'
                        WHEN page_path LIKE '/fde/kim-dongha%%' THEN '김동하'
                        WHEN page_path LIKE '/fde/kim-soyeon%%' THEN '김소연'
                        WHEN page_path LIKE '/fde/kim-youngshin%%' THEN '김영신'
                        WHEN page_path LIKE '/fde/park-mingyu%%' THEN '박민규'
                        WHEN page_path LIKE '/fde/lee-yewon%%' THEN '이예원'
                        WHEN page_path LIKE '/fde/choi-jihee%%' THEN '최지희'
                        WHEN page_path LIKE '/fde/choi-chihwan%%' THEN '최치환'
                    END AS member_name,
                    COUNT(*) AS visit_count
                FROM page_visits
                WHERE page_path LIKE '/fde/%%'
                GROUP BY 1
            ) pv ON ms.member_name = pv.member_name
            ORDER BY ms.problem_score DESC, ms.member_name ASC
        """)
        rows = cur.fetchall()

    ranking = []
    for i, row in enumerate(rows, 1):
        entry = dict(row)
        entry["rank"] = i
        ranking.append(entry)
    return {"ranking": ranking}


@router.get("/daily-scores")
def get_daily_scores():
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name,
                   (evaluated_at AT TIME ZONE 'Asia/Seoul')::date AS date,
                   AVG(problem_score)::float AS avg_score
            FROM score_history
            GROUP BY member_name, date
            ORDER BY date ASC, member_name ASC
        """)
        rows = cur.fetchall()

    return {
        "daily_scores": [
            {
                "member_name": r["member_name"],
                "date": r["date"].isoformat(),
                "avg_score": round(r["avg_score"], 1) if r["avg_score"] is not None else None,
            }
            for r in rows
        ]
    }


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
