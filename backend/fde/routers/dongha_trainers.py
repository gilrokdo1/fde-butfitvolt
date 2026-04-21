"""김동하 트레이너 평가 대시보드 API 라우터.

스냅샷(`dongha_trainer_monthly`)에서 월 단위 집계를 읽고,
기간 필터에 맞춰 트레이너별 평균/합계 지표를 반환.

판정(미달/재계약 고려)은 클라이언트가 기준값과 raw 값을 비교해서 결정.
"""
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter(prefix="/fde-api/dongha/trainers", tags=["dongha-trainers"])


def _default_end_month() -> str:
    return (date.today() - timedelta(days=1)).strftime("%Y-%m")


def _default_start_month() -> str:
    return "2025-01"


def _latest_snapshot_date(cur, start_month: str, end_month: str) -> str | None:
    cur.execute("""
        SELECT MAX(snapshot_date) AS d
        FROM dongha_trainer_monthly
        WHERE target_month BETWEEN %s AND %s
    """, (start_month, end_month))
    row = cur.fetchone()
    return str(row["d"]) if row and row["d"] else None


def _month_count(start_month: str, end_month: str) -> int:
    sy, sm = int(start_month[:4]), int(start_month[5:7])
    ey, em = int(end_month[:4]), int(end_month[5:7])
    return max(1, (ey - sy) * 12 + (em - sm) + 1)


@router.get("/available-months")
def available_months():
    """스냅샷에 존재하는 월 목록."""
    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            SELECT DISTINCT target_month FROM dongha_trainer_monthly
            ORDER BY target_month DESC
        """)
        months = [r["target_month"] for r in cur.fetchall()]
    return {"months": months}


@router.get("/criteria")
def get_criteria():
    """현재 기준값."""
    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            SELECT active_members_min, sessions_min, conversion_min, rereg_min,
                   fail_threshold, updated_at, updated_by
            FROM dongha_trainer_criteria
            WHERE id = 1
        """)
        row = cur.fetchone()
    if not row:
        return {
            "active_members_min": 15,
            "sessions_min": 120,
            "conversion_min": 30.0,
            "rereg_min": 40.0,
            "fail_threshold": 3,
            "updated_at": None,
            "updated_by": None,
        }
    return {
        "active_members_min": int(row["active_members_min"] or 0),
        "sessions_min": int(row["sessions_min"] or 0),
        "conversion_min": float(row["conversion_min"] or 0),
        "rereg_min": float(row["rereg_min"] or 0),
        "fail_threshold": int(row["fail_threshold"] or 3),
        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        "updated_by": row["updated_by"],
    }


class CriteriaUpdate(BaseModel):
    active_members_min: int
    sessions_min: int
    conversion_min: float
    rereg_min: float
    fail_threshold: int = 3


@router.put("/criteria")
def update_criteria(body: CriteriaUpdate, request: Request):
    if body.active_members_min < 0 or body.sessions_min < 0:
        raise HTTPException(status_code=400, detail="음수 기준값은 허용되지 않습니다")
    if not (0 <= body.conversion_min <= 100) or not (0 <= body.rereg_min <= 100):
        raise HTTPException(status_code=400, detail="전환율/재등록률은 0~100 범위여야 합니다")
    if not (1 <= body.fail_threshold <= 4):
        raise HTTPException(status_code=400, detail="재계약 임계값은 1~4 범위여야 합니다")

    user = getattr(request.state, "user", None) or {}
    updated_by = user.get("email") or user.get("username") or "unknown"

    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            INSERT INTO dongha_trainer_criteria
                (id, active_members_min, sessions_min, conversion_min, rereg_min, fail_threshold, updated_at, updated_by)
            VALUES (1, %s, %s, %s, %s, %s, NOW(), %s)
            ON CONFLICT (id) DO UPDATE SET
                active_members_min = EXCLUDED.active_members_min,
                sessions_min = EXCLUDED.sessions_min,
                conversion_min = EXCLUDED.conversion_min,
                rereg_min = EXCLUDED.rereg_min,
                fail_threshold = EXCLUDED.fail_threshold,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
        """, (
            body.active_members_min, body.sessions_min,
            body.conversion_min, body.rereg_min, body.fail_threshold,
            updated_by,
        ))
    return {"message": "저장됨", "updated_by": updated_by}


@router.get("/overview")
def overview(
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """트레이너별 기간 평균/합계 지표.

    - active_members_avg, sessions_avg : 월 평균 (기간 중 해당 월이 없으면 0 포함 평균)
    - conversion_rate, rereg_rate      : SUM(분자) / SUM(분모) × 100
    - data_months: 해당 트레이너가 기간 내 관측된 월 수
    """
    start = start or _default_start_month()
    end = end or _default_end_month()
    if start > end:
        raise HTTPException(status_code=400, detail="start가 end보다 뒤입니다")

    month_count = _month_count(start, end)

    with safe_db("fde") as (_conn, cur):
        snap = _latest_snapshot_date(cur, start, end)
        if not snap:
            return {"data": [], "_meta": {"snapshot_date": None, "start": start, "end": end, "month_count": month_count}}

        cur.execute("""
            SELECT trainer_user_id,
                   MAX(trainer_name) AS trainer_name,
                   branch,
                   SUM(active_members) AS active_sum,
                   SUM(sessions_done) AS sessions_sum,
                   SUM(trial_end_count) AS trial_end_sum,
                   SUM(trial_convert_count) AS trial_convert_sum,
                   SUM(regular_end_count) AS regular_end_sum,
                   SUM(regular_rereg_count) AS regular_rereg_sum,
                   COUNT(DISTINCT target_month) AS data_months
            FROM dongha_trainer_monthly
            WHERE snapshot_date = %s
              AND target_month BETWEEN %s AND %s
            GROUP BY trainer_user_id, branch
            ORDER BY MAX(trainer_name) NULLS LAST, branch
        """, (snap, start, end))
        rows = cur.fetchall()

    data = []
    for r in rows:
        active_sum = int(r["active_sum"] or 0)
        sessions_sum = int(r["sessions_sum"] or 0)
        trial_end = int(r["trial_end_sum"] or 0)
        trial_conv = int(r["trial_convert_sum"] or 0)
        reg_end = int(r["regular_end_sum"] or 0)
        reg_rereg = int(r["regular_rereg_sum"] or 0)

        data.append({
            "trainer_user_id": int(r["trainer_user_id"]),
            "trainer_name": r["trainer_name"],
            "branch": r["branch"],
            "active_members_avg": round(active_sum / month_count, 1),
            "sessions_avg": round(sessions_sum / month_count, 1),
            "conversion_rate": round(trial_conv / trial_end * 100, 1) if trial_end > 0 else None,
            "rereg_rate": round(reg_rereg / reg_end * 100, 1) if reg_end > 0 else None,
            "active_sum": active_sum,
            "sessions_sum": sessions_sum,
            "trial_end": trial_end,
            "trial_convert": trial_conv,
            "regular_end": reg_end,
            "regular_rereg": reg_rereg,
            "data_months": int(r["data_months"] or 0),
        })

    return {
        "data": data,
        "_meta": {
            "snapshot_date": snap,
            "start": start,
            "end": end,
            "month_count": month_count,
            "row_count": len(data),
        },
    }


@router.get("/monthly")
def monthly(
    trainer_user_id: int = Query(..., alias="trainer_user_id"),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """단일 트레이너 월별 추이 (지점별 + 월별 분리, 프론트에서 집계)."""
    start = start or _default_start_month()
    end = end or _default_end_month()

    with safe_db("fde") as (_conn, cur):
        snap = _latest_snapshot_date(cur, start, end)
        if not snap:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT target_month, branch, trainer_name,
                   active_members, sessions_done,
                   trial_end_count, trial_convert_count,
                   regular_end_count, regular_rereg_count
            FROM dongha_trainer_monthly
            WHERE snapshot_date = %s
              AND trainer_user_id = %s
              AND target_month BETWEEN %s AND %s
            ORDER BY target_month, branch
        """, (snap, trainer_user_id, start, end))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"snapshot_date": snap, "start": start, "end": end, "trainer_user_id": trainer_user_id}}
