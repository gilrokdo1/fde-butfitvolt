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
                   teamfit_mbs_id, teamfit_begin, teamfit_end,
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
    return {
        "total": len(data),
        "pending": sum(1 for r in data if r["status"] == "pending"),
        "resolved": sum(1 for r in data if r["status"] == "resolved"),
        "data": data,
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
