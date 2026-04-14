from fastapi import APIRouter, Query, HTTPException
from utils.db import safe_db

router = APIRouter()


@router.get("/members")
def get_members(
    place: str = Query("all"),
    status: str = Query("all"),
    category: str = Query("all"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * limit

    conditions = ["place_id NOT IN (3,4,5,6,7,8,12,23)"]
    params: list = []

    if place != "all":
        conditions.append("place = %s")
        params.append(place)

    if status != "all":
        conditions.append("이용상태 = %s")
        params.append(status)

    if category != "all":
        conditions.append("category_depth2 = %s")
        params.append(category)

    where = " AND ".join(conditions)

    try:
        with safe_db("replica") as (conn, cur):
            # 전체 수
            cur.execute(f"SELECT COUNT(*) FROM raw_data_mbs WHERE {where}", params)
            total = cur.fetchone()["count"]

            # 요약 카드
            cur.execute(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE 이용상태 = '이용중') AS active_count,
                    COUNT(*) FILTER (WHERE 이용상태 IN ('만료','완료') AND 멤버십종료일 >= CURRENT_DATE - INTERVAL '30 days') AS recently_expired,
                    COUNT(*) FILTER (WHERE 이용상태 = '환불') AS refund_count
                FROM raw_data_mbs WHERE {where}
                """,
                params,
            )
            summary_row = dict(cur.fetchone())
            summary_row["total"] = total

            # 데이터
            cur.execute(
                f"""
                SELECT
                    회원이름,
                    연락처,
                    place          AS 지점,
                    category_depth2 AS 카테고리대분류,
                    category_name  AS 카테고리,
                    멤버십명       AS 상품명,
                    payment_amount AS 가격,
                    멤버십시작일   AS 시작일,
                    멤버십종료일   AS 종료일,
                    이용상태,
                    체험정규,
                    ses_count      AS 출석수,
                    payment_status AS 결제상태
                FROM raw_data_mbs
                WHERE {where}
                ORDER BY 멤버십시작일 DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            members = [dict(r) for r in cur.fetchall()]

        # 지점 목록
        with safe_db("replica") as (conn, cur):
            cur.execute(
                """
                SELECT DISTINCT place FROM raw_data_mbs
                WHERE place IS NOT NULL
                  AND place_id NOT IN (3,4,5,6,7,8,12,23)
                ORDER BY place
                """
            )
            places = [r["place"] for r in cur.fetchall() if r["place"]]

        # 카테고리 목록
        with safe_db("replica") as (conn, cur):
            cur.execute(
                """
                SELECT DISTINCT category_depth2 FROM raw_data_mbs
                WHERE category_depth2 IS NOT NULL
                  AND place_id NOT IN (3,4,5,6,7,8,12,23)
                ORDER BY category_depth2
                """
            )
            categories = [r["category_depth2"] for r in cur.fetchall() if r["category_depth2"]]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 오류: {str(e)}")

    return {
        "members": members,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary_row,
        "places": places,
        "categories": categories,
    }
