from fastapi import APIRouter, Query
from utils.db import safe_db

router = APIRouter()

EXCLUDED_PLACES = (3, 4, 5, 6, 7, 8, 12, 23)


@router.get("/places")
def get_places():
    """유효회원이 있는 지점 목록"""
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


@router.get("/active-members")
def get_active_members(
    place_id: int = Query(default=None, description="지점 ID (없으면 전체)"),
    sort_by: str = Query(default="회원이름", description="정렬 컬럼"),
    sort_order: str = Query(default="asc", description="asc | desc"),
):
    """
    지점별 유효회원 목록.
    한 회원이 여러 멤버십을 가진 경우 effective_payment 최고가 1건만 반환.
    """
    allowed_sort = {
        "회원이름", "연락처", "지점", "멤버십명", "카테고리",
        "시작일", "종료일", "결제금액",
    }
    if sort_by not in allowed_sort:
        sort_by = "회원이름"
    order = "DESC" if sort_order.lower() == "desc" else "ASC"

    place_cond = "AND place_id = %(place_id)s" if place_id else ""

    sort_col_map = {
        "회원이름": "회원이름",
        "연락처": "연락처",
        "지점": "place",
        "멤버십명": "멤버십명",
        "카테고리": "카테고리",
        "시작일": "시작일",
        "종료일": "종료일",
        "결제금액": "결제금액",
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

    return {
        "total": len(rows),
        "data": [dict(r) for r in rows],
    }
