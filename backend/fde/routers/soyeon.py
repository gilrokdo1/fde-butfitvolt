from datetime import date

from fastapi import APIRouter, Query

from utils.db import safe_db

router = APIRouter()


@router.get("/teamfit-active")
def get_teamfit_active(target_date: date = Query(default=None)):
    if target_date is None:
        target_date = date.today()

    with safe_db("replica") as (conn, cur):
        cur.execute(
            """
            SELECT
                place AS 지점,
                COUNT(DISTINCT user_id) AS 유효회원수
            FROM raw_data_activeuser
            WHERE category = '팀버핏'
              AND begin_date <= %(date)s
              AND end_date   >= %(date)s
            GROUP BY place
            ORDER BY 유효회원수 DESC
            """,
            {"date": target_date},
        )
        rows = cur.fetchall()

    return {
        "date": target_date.isoformat(),
        "data": [dict(r) for r in rows],
        "total": sum(r["유효회원수"] for r in rows),
    }
