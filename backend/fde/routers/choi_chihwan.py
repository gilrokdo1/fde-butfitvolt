import csv
import io
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from utils.db import safe_db

router = APIRouter()

EXCLUDED_PLACES = (3, 4, 5, 6, 7, 8, 12, 23)


@router.get("/places")
def get_places():
    with safe_db("replica") as (_, cur):
        cur.execute(
            """
            SELECT DISTINCT place_id, place AS place_name
            FROM raw_data_mbs
            WHERE 이용상태 = '이용중'
              AND place_id NOT IN %(excluded)s
            ORDER BY place_name
            """,
            {"excluded": EXCLUDED_PLACES},
        )
        rows = cur.fetchall()
    return {"places": [dict(r) for r in rows]}


@router.get("/branch-summary")
def get_branch_summary():
    """지점별 유효회원 수 요약"""
    with safe_db("replica") as (_, cur):
        cur.execute(
            """
            SELECT place, place_id, COUNT(DISTINCT user_id) AS 유효회원수
            FROM raw_data_activeuser
            WHERE begin_date <= CURRENT_DATE
              AND end_date >= CURRENT_DATE
              AND place_id NOT IN %(excluded)s
            GROUP BY place, place_id
            ORDER BY 유효회원수 DESC
            """,
            {"excluded": EXCLUDED_PLACES},
        )
        rows = cur.fetchall()
    total = sum(r["유효회원수"] for r in rows)
    return {"total": total, "data": [dict(r) for r in rows]}


@router.get("/monthly-trend")
def get_monthly_trend(
    place_id: int = Query(default=None),
):
    """최근 12개월 월별 유효회원 수 추이"""
    place_cond = "AND place_id = %(place_id)s" if place_id else ""
    with safe_db("replica") as (_, cur):
        cur.execute(
            f"""
            WITH months AS (
                SELECT TO_CHAR(d, 'YYYY-MM') AS month,
                       DATE_TRUNC('month', d) AS month_start,
                       (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::date AS month_end
                FROM generate_series(
                    DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
                    DATE_TRUNC('month', CURRENT_DATE),
                    '1 month'
                ) d
            )
            SELECT m.month, COUNT(DISTINCT a.user_id) AS 유효회원수
            FROM months m
            LEFT JOIN raw_data_activeuser a
              ON a.begin_date <= m.month_end
             AND a.end_date   >= m.month_start
             AND a.place_id NOT IN %(excluded)s
             {place_cond}
            GROUP BY m.month
            ORDER BY m.month
            """,
            {"excluded": EXCLUDED_PLACES, "place_id": place_id},
        )
        rows = cur.fetchall()
    return {"data": [dict(r) for r in rows]}


@router.get("/active-members/export.csv")
def export_active_members_csv(place_id: int = Query(default=None)):
    """유효회원 목록 CSV 다운로드"""
    place_cond = "AND place_id = %(place_id)s" if place_id else ""
    with safe_db("replica") as (_, cur):
        cur.execute(
            f"""
            SELECT *
            FROM (
                SELECT DISTINCT ON (user_id, place_id)
                    place                   AS 지점,
                    "회원이름",
                    "연락처",
                    "멤버십명",
                    "category_name"         AS 카테고리,
                    "멤버십시작일"           AS 시작일,
                    "멤버십종료일"           AS 종료일,
                    COALESCE("effective_payment", 0) AS 결제금액
                FROM raw_data_mbs
                WHERE 이용상태 = '이용중'
                  AND place_id NOT IN %(excluded)s
                  {place_cond}
                ORDER BY user_id, place_id, "effective_payment" DESC NULLS LAST
            ) sub
            ORDER BY 지점, "회원이름"
            """,
            {"excluded": EXCLUDED_PLACES, "place_id": place_id},
        )
        rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["지점", "회원이름", "연락처", "멤버십명", "카테고리", "시작일", "종료일", "결제금액"])
    for r in rows:
        writer.writerow([
            r["지점"], r["회원이름"], r["연락처"], r["멤버십명"],
            r["카테고리"] or "", str(r["시작일"])[:10], str(r["종료일"])[:10], r["결제금액"],
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=active_members.csv"},
    )


@router.get("/active-members")
def get_active_members(
    place_id: int = Query(default=None),
    sort_by: str = Query(default="회원이름"),
    sort_order: str = Query(default="asc"),
):
    allowed_sort = {
        "회원이름", "연락처", "지점", "멤버십명", "카테고리",
        "시작일", "종료일", "결제금액",
    }
    if sort_by not in allowed_sort:
        sort_by = "회원이름"
    order = "DESC" if sort_order.lower() == "desc" else "ASC"
    place_cond = "AND place_id = %(place_id)s" if place_id else ""
    sort_col_map = {
        "회원이름": "회원이름", "연락처": "연락처", "지점": "place",
        "멤버십명": "멤버십명", "카테고리": "카테고리",
        "시작일": "시작일", "종료일": "종료일", "결제금액": "결제금액",
    }
    order_col = sort_col_map[sort_by]

    with safe_db("replica") as (_, cur):
        cur.execute(
            f"""
            SELECT *
            FROM (
                SELECT DISTINCT ON (user_id, place_id)
                    user_id,
                    place_id,
                    place                   AS 지점,
                    "회원이름",
                    "연락처",
                    "멤버십명",
                    "category_name"         AS 카테고리,
                    "멤버십시작일"           AS 시작일,
                    "멤버십종료일"           AS 종료일,
                    COALESCE("effective_payment", 0) AS 결제금액
                FROM raw_data_mbs
                WHERE 이용상태 = '이용중'
                  AND place_id NOT IN %(excluded)s
                  {place_cond}
                ORDER BY user_id, place_id, "effective_payment" DESC NULLS LAST
            ) sub
            ORDER BY "{order_col}" {order} NULLS LAST
            """,
            {"excluded": EXCLUDED_PLACES, "place_id": place_id},
        )
        rows = cur.fetchall()

    return {"total": len(rows), "data": [dict(r) for r in rows]}
