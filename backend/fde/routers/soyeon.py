from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from utils.db import safe_db

router = APIRouter()


# ── 팀버핏 유효회원 ────────────────────────────────────────────────────────────

@router.get("/teamfit-active")
def get_teamfit_active(target_date: date = Query(default=None)):
    if target_date is None:
        target_date = date.today()

    with safe_db("replica") as (_, cur):
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


@router.get("/teamfit-members")
def get_teamfit_members(
    target_date: date = Query(default=None),
    place: str = Query(default=None),
):
    """지점별 팀버핏 유효회원 상세 목록"""
    if target_date is None:
        target_date = date.today()

    place_cond = "AND au.place = %(place)s" if place else ""
    params: dict = {"date": target_date, "place": place}

    with safe_db("replica") as (_, cur):
        cur.execute(
            f"""
            SELECT
                au.place                                            AS 지점,
                uu.name                                             AS 이름,
                au.phone_number                                     AS 연락처,
                au.product_name                                     AS 멤버십명,
                CASE uu.gender WHEN 'M' THEN '남' WHEN 'F' THEN '여' ELSE '-' END
                                                                    AS 성별,
                DATE_PART('year', AGE(uu.birth_date))::INT          AS 나이,
                au.begin_date                                       AS 시작일,
                au.end_date                                         AS 종료일,
                mbs.payment_amount                                  AS 결제금액,
                NULL::date                                          AS 결제일,
                CASE
                    WHEN mbs.category_depth2 ILIKE '%%임직원%%'
                      OR mbs.category_depth2 ILIKE '%%패밀리%%'
                    THEN '예' ELSE '아니오'
                END                                                 AS 임직원여부,
                NULL::text                                          AS 마케팅동의
            FROM raw_data_activeuser au
            LEFT JOIN user_user uu
                   ON uu.id = au.user_id
            LEFT JOIN raw_data_mbs mbs
                   ON mbs.membership_id = au.mbs_id
            WHERE au.category   = '팀버핏'
              AND au.begin_date <= %(date)s
              AND au.end_date   >= %(date)s
              {place_cond}
            ORDER BY au.place, au.end_date
            """,
            params,
        )
        rows = cur.fetchall()

    return {
        "date": target_date.isoformat(),
        "place": place,
        "count": len(rows),
        "members": [dict(r) for r in rows],
    }


# ── 멤버십 이상케이스 ──────────────────────────────────────────────────────────

@router.get("/anomalies")
def get_anomalies(
    status: str = Query(default="pending"),   # pending | resolved | all
    anomaly_type: str = Query(default="all"), # no_fitness | teamfit_overlap | all
):
    conditions = []
    params: list = []

    if status != "all":
        conditions.append("status = %s")
        params.append(status)
    if anomaly_type != "all":
        conditions.append("anomaly_type = %s")
        params.append(anomaly_type)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with safe_db("fde") as (_, cur):
        cur.execute(
            f"""
            SELECT id, anomaly_key, anomaly_type, user_id, phone_number, place,
                   user_name, teamfit_mbs_id, teamfit_mbs_name,
                   teamfit_begin, teamfit_end,
                   overlap_mbs_id, overlap_begin, overlap_end,
                   status, detected_at, resolved_at, resolved_by
            FROM soyeon_anomalies
            {where}
            ORDER BY detected_at DESC
            """,
            params,
        )
        rows = cur.fetchall()

    data = [dict(r) for r in rows]

    # bplace PK 순으로 지점 정렬
    with safe_db("replica") as (_, cur):
        cur.execute("SELECT name FROM b_class_bplace WHERE is_active = true ORDER BY id ASC")
        place_order = [r["name"] for r in cur.fetchall()]

    # 데이터에 실제로 있는 지점만, bplace PK 순으로
    data_places = {r["place"] for r in data if r["place"]}
    ordered_places = [p for p in place_order if p in data_places]
    # bplace에 없는 지점은 뒤에 추가
    ordered_places += sorted(data_places - set(ordered_places))

    return {
        "total": len(data),
        "pending": sum(1 for r in data if r["status"] == "pending"),
        "resolved": sum(1 for r in data if r["status"] == "resolved"),
        "data": data,
        "place_order": ordered_places,
    }


@router.post("/anomalies/{anomaly_id}/resolve")
def resolve_anomaly(anomaly_id: int, request: Request):
    resolver = getattr(request.state, "user", {}).get("name", "unknown")

    with safe_db("fde") as (_, cur):
        cur.execute(
            """
            UPDATE soyeon_anomalies
            SET status = 'resolved', resolved_at = NOW(), resolved_by = %s
            WHERE id = %s AND status = 'pending'
            RETURNING id
            """,
            (resolver, anomaly_id),
        )
        if not cur.fetchone():
            raise HTTPException(404, "케이스를 찾을 수 없거나 이미 처리됨")

    return {"message": "처리 완료"}


@router.post("/anomalies/detect")
def trigger_detect():
    """수동으로 감지 실행 (테스트용)"""
    from jobs.detect_anomalies import detect
    result = detect()
    return result
