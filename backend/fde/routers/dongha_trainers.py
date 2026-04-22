"""김동하 트레이너 평가 대시보드 API 라우터.

스냅샷(`dongha_trainer_monthly`)에서 월 단위 집계를 읽고,
기간 필터에 맞춰 **(trainer_name, branch)** 단위로 병합된 지표를 반환.

동일 이름이 여러 trainer_user_id로 중복되는 경우를 해결하기 위해
집계 키를 trainer_user_id → trainer_name 으로 변경했다.

판정(미달/재계약 고려)은 클라이언트가 기준값과 raw 값을 비교해서 결정.

상세 모달(셀 클릭)을 위해 replica DB를 바로 조회하는 엔드포인트도 제공:
  - /sessions        : 세션 목록
  - /trial-members   : 체험 종료자 목록
  - /rereg-members   : 정규 만료자 목록
  - /active-members  : 기간 내 유효 멤버십 회원 목록
  - /member-purchases: 특정 회원의 기간 내 PT 구매 내역 (아코디언용)
"""
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter(prefix="/fde-api/dongha/trainers", tags=["dongha-trainers"])


def _default_end_month() -> str:
    return (date.today() - timedelta(days=1)).strftime("%Y-%m")


def _default_start_month() -> str:
    return "2025-01"


def _month_range(target_month: str) -> tuple[str, str]:
    """'YYYY-MM' → ('YYYY-MM-01', 월말)."""
    y, m = int(target_month[:4]), int(target_month[5:7])
    start = date(y, m, 1)
    end = (start + relativedelta(months=1)) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _period_range(start_month: str, end_month: str) -> tuple[str, str]:
    """기간 전체 월초~월말 ISO."""
    s, _ = _month_range(start_month)
    _, e = _month_range(end_month)
    return s, e


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


# ── 공통 유틸 ─────────────────────────────────────────────────────

def _normalize_period(start: str | None, end: str | None) -> tuple[str, str]:
    start = start or _default_start_month()
    end = end or _default_end_month()
    if start > end:
        raise HTTPException(status_code=400, detail="start가 end보다 뒤입니다")
    return start, end


# 환불 멤버십 제외 필터 (체험전환율/재등록률 왜곡 방지)
_PT_PAID_FILTER = "AND COALESCE(\"결제상태\", '') NOT IN ('전체환불', '환불')"


def _month_shift(month: str, delta: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    d = date(y, m, 1) + relativedelta(months=delta)
    return d.strftime("%Y-%m")


# ── 제외 트레이너 (직원 등) ────────────────────────────────────────

@router.get("/excluded")
def list_excluded():
    """제외 트레이너 명단 조회."""
    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            SELECT trainer_name, reason, excluded_by, created_at
            FROM dongha_trainer_excluded
            ORDER BY created_at DESC, trainer_name
        """)
        rows = [
            {
                "trainer_name": r["trainer_name"],
                "reason": r["reason"],
                "excluded_by": r["excluded_by"],
                "created_at": str(r["created_at"]) if r["created_at"] else None,
            }
            for r in cur.fetchall()
        ]
    return {"data": rows, "count": len(rows)}


class ExcludeUpsert(BaseModel):
    trainer_name: str
    reason: str | None = None


@router.post("/excluded")
def add_excluded(body: ExcludeUpsert, request: Request):
    name = body.trainer_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="trainer_name이 비어있습니다")
    user = getattr(request.state, "user", None) or {}
    who = user.get("email") or user.get("username") or "unknown"
    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            INSERT INTO dongha_trainer_excluded (trainer_name, reason, excluded_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (trainer_name) DO UPDATE SET
                reason = EXCLUDED.reason,
                excluded_by = EXCLUDED.excluded_by,
                created_at = NOW()
        """, (name, body.reason, who))
    return {"message": "추가됨", "trainer_name": name}


@router.delete("/excluded/{trainer_name}")
def remove_excluded(trainer_name: str):
    with safe_db("fde") as (_conn, cur):
        cur.execute("DELETE FROM dongha_trainer_excluded WHERE trainer_name = %s", (trainer_name,))
    return {"message": "삭제됨", "trainer_name": trainer_name}


def _fetch_excluded_names(cur) -> set[str]:
    cur.execute("SELECT trainer_name FROM dongha_trainer_excluded")
    return {r["trainer_name"] for r in cur.fetchall()}


def _fetch_active_names_last_3mo(cur, snap: str, end_month: str) -> set[str]:
    """스냅샷 기준 최근 3개월(end_month 포함)에 세션 1건 이상인 trainer_name 집합.

    latest snapshot_date 에서 end_month ~ end_month-2 범위에 sessions_done > 0 인 이름.
    """
    min_month = _month_shift(end_month, -2)
    cur.execute("""
        SELECT trainer_name
        FROM dongha_trainer_monthly
        WHERE snapshot_date = %s
          AND target_month BETWEEN %s AND %s
          AND trainer_name IS NOT NULL
        GROUP BY trainer_name
        HAVING SUM(sessions_done) > 0
    """, (snap, min_month, end_month))
    return {r["trainer_name"] for r in cur.fetchall()}


# ── /overview: (trainer_name, branch) 병합 ───────────────────────

@router.get("/overview")
def overview(
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """트레이너별 기간 평균/합계 지표 — (trainer_name, branch) 단위 병합.

    동일 이름 + 동일 지점의 여러 trainer_user_id는 한 행으로 합산된다.
    """
    start, end = _normalize_period(start, end)
    month_count = _month_count(start, end)

    with safe_db("fde") as (_conn, cur):
        snap = _latest_snapshot_date(cur, start, end)
        if not snap:
            return {"data": [], "_meta": {"snapshot_date": None, "start": start, "end": end, "month_count": month_count}}

        excluded_names = _fetch_excluded_names(cur)
        active_names = _fetch_active_names_last_3mo(cur, snap, end)

        # trainer_name NULL 이면 '#<id>' 로 fallback해서 같은 키로 묶이지 않도록 분리
        cur.execute("""
            SELECT COALESCE(trainer_name, '#' || trainer_user_id::text) AS name_key,
                   MAX(trainer_name) AS trainer_name,
                   branch,
                   SUM(active_members) AS active_sum,
                   SUM(sessions_done) AS sessions_sum,
                   SUM(trial_end_count) AS trial_end_sum,
                   SUM(trial_convert_count) AS trial_convert_sum,
                   SUM(regular_end_count) AS regular_end_sum,
                   SUM(regular_rereg_count) AS regular_rereg_sum,
                   COUNT(DISTINCT target_month) AS data_months,
                   ARRAY_AGG(DISTINCT trainer_user_id) AS trainer_user_ids
            FROM dongha_trainer_monthly
            WHERE snapshot_date = %s
              AND target_month BETWEEN %s AND %s
            GROUP BY COALESCE(trainer_name, '#' || trainer_user_id::text), branch
            ORDER BY MAX(trainer_name) NULLS LAST, branch
        """, (snap, start, end))
        rows = cur.fetchall()

    data = []
    filter_stats = {"excluded_staff": 0, "inactive_3mo": 0}
    for r in rows:
        name = r["trainer_name"]
        # 직원 등 수동 제외
        if name and name in excluded_names:
            filter_stats["excluded_staff"] += 1
            continue
        # 최근 3개월 세션 0 → 계약 종료 추정 제외
        if name and name not in active_names:
            filter_stats["inactive_3mo"] += 1
            continue

        active_sum = int(r["active_sum"] or 0)
        sessions_sum = int(r["sessions_sum"] or 0)
        trial_end = int(r["trial_end_sum"] or 0)
        trial_conv = int(r["trial_convert_sum"] or 0)
        reg_end = int(r["regular_end_sum"] or 0)
        reg_rereg = int(r["regular_rereg_sum"] or 0)
        ids = [int(x) for x in (r["trainer_user_ids"] or []) if x is not None]

        data.append({
            "trainer_name": r["trainer_name"],
            "trainer_user_ids": ids,
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
            "excluded_staff_count": filter_stats["excluded_staff"],
            "inactive_3mo_count": filter_stats["inactive_3mo"],
            "inactive_3mo_window": f"{_month_shift(end, -2)} ~ {end}",
        },
    }


# ── /monthly: (trainer_name, branch) 기준 월별 ────────────────────

@router.get("/monthly")
def monthly(
    trainer_name: str = Query(...),
    branch: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """단일 트레이너+지점의 월별 지표 — 여러 trainer_user_id는 합산."""
    start, end = _normalize_period(start, end)

    with safe_db("fde") as (_conn, cur):
        snap = _latest_snapshot_date(cur, start, end)
        if not snap:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT target_month,
                   branch,
                   MAX(trainer_name) AS trainer_name,
                   SUM(active_members)        AS active_members,
                   SUM(sessions_done)         AS sessions_done,
                   SUM(trial_end_count)       AS trial_end_count,
                   SUM(trial_convert_count)   AS trial_convert_count,
                   SUM(regular_end_count)     AS regular_end_count,
                   SUM(regular_rereg_count)   AS regular_rereg_count
            FROM dongha_trainer_monthly
            WHERE snapshot_date = %s
              AND trainer_name = %s
              AND branch = %s
              AND target_month BETWEEN %s AND %s
            GROUP BY target_month, branch
            ORDER BY target_month
        """, (snap, trainer_name, branch, start, end))
        rows = [
            {
                "target_month": r["target_month"],
                "branch": r["branch"],
                "trainer_name": r["trainer_name"],
                "active_members": int(r["active_members"] or 0),
                "sessions_done": int(r["sessions_done"] or 0),
                "trial_end_count": int(r["trial_end_count"] or 0),
                "trial_convert_count": int(r["trial_convert_count"] or 0),
                "regular_end_count": int(r["regular_end_count"] or 0),
                "regular_rereg_count": int(r["regular_rereg_count"] or 0),
            }
            for r in cur.fetchall()
        ]
    return {
        "data": rows,
        "_meta": {
            "snapshot_date": snap,
            "start": start,
            "end": end,
            "trainer_name": trainer_name,
            "branch": branch,
        },
    }


# ── 상세 엔드포인트 (replica DB 직접 조회) ──────────────────────────

@router.get("/sessions")
def trainer_sessions(
    trainer_name: str = Query(...),
    branch: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """트레이너 세션 목록 — 기간 내 PT 세션 (출석 여부 모두 포함)."""
    start, end = _normalize_period(start, end)
    s, e = _period_range(start, end)
    with safe_db("replica") as (_conn, cur):
        cur.execute("""
            SELECT "수업날짜"::text AS 수업날짜,
                   "시작시간"::text AS 시작시간,
                   "회원이름"       AS 회원이름,
                   "회원연락처"     AS 회원연락처,
                   "멤버십명"       AS 멤버십명,
                   "체험정규"       AS 체험정규,
                   "출석여부"       AS 출석여부,
                   "예약취소"       AS 예약취소
            FROM raw_data_reservation
            WHERE "트레이너" = %s
              AND "지점명" = %s
              AND "수업날짜" BETWEEN %s AND %s
              AND "멤버십명" ILIKE %s
            ORDER BY "수업날짜" DESC, "시작시간" DESC
        """, (trainer_name, branch, s, e, "%PT%"))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"start": start, "end": end, "trainer_name": trainer_name, "branch": branch, "count": len(rows)}}


@router.get("/trial-members")
def trainer_trial_members(
    trainer_name: str = Query(...),
    branch: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """체험전환 대상자 — 기간 중 체험 멤버십이 종료된 회원 (환불 제외)."""
    start, end = _normalize_period(start, end)
    s, e = _period_range(start, end)
    with safe_db("replica") as (_conn, cur):
        cur.execute(f"""
            SELECT "회원이름"          AS 회원이름,
                   "회원연락처"        AS 회원연락처,
                   "멤버십명"          AS 멤버십명,
                   "멤버십시작일"::text AS 멤버십시작일,
                   "멤버십종료일"::text AS 멤버십종료일,
                   "전환재등록"        AS 전환재등록,
                   "총횟수"            AS 총횟수,
                   "사용횟수"          AS 사용횟수,
                   "결제상태"          AS 결제상태
            FROM raw_data_pt
            WHERE "담당트레이너" = %s
              AND "지점명" = %s
              AND "체험정규" = '체험'
              AND "멤버십종료일" BETWEEN %s AND %s
              {_PT_PAID_FILTER}
            ORDER BY "멤버십종료일" DESC, "회원이름"
        """, (trainer_name, branch, s, e))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"start": start, "end": end, "trainer_name": trainer_name, "branch": branch, "count": len(rows)}}


@router.get("/rereg-members")
def trainer_rereg_members(
    trainer_name: str = Query(...),
    branch: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """재등록 대상자 — 기간 중 정규 PT 멤버십이 종료된 회원 (무제한 제외).

    재등록 여부는 종료일 이후 30일 내 '재등록' 멤버십이 있었는지로 판정.
    """
    start, end = _normalize_period(start, end)
    s, e = _period_range(start, end)
    # 30일 내 재등록 lookup 범위
    end_plus30 = (date.fromisoformat(e) + timedelta(days=30)).isoformat()
    with safe_db("replica") as (_conn, cur):
        cur.execute(f"""
            WITH ending AS (
                SELECT "회원이름" AS name,
                       "회원연락처" AS contact,
                       "멤버십명"   AS mbs_name,
                       "멤버십시작일" AS begin_date,
                       "멤버십종료일" AS end_date,
                       "총횟수"      AS total_cnt,
                       "사용횟수"    AS used_cnt,
                       "결제상태"    AS 결제상태
                FROM raw_data_pt
                WHERE "담당트레이너" = %s
                  AND "지점명" = %s
                  AND "체험정규" = '정규'
                  AND "멤버십종료일" BETWEEN %s AND %s
                  AND "총횟수" < 99999
                  {_PT_PAID_FILTER}
            ),
            renewed AS (
                SELECT DISTINCT "회원연락처" AS contact
                FROM raw_data_pt
                WHERE "체험정규" = '정규'
                  AND "전환재등록" = '재등록'
                  AND "멤버십시작일" BETWEEN %s AND %s
                  {_PT_PAID_FILTER}
            )
            SELECT e.name         AS 회원이름,
                   e.contact      AS 회원연락처,
                   e.mbs_name     AS 멤버십명,
                   e.begin_date::text AS 멤버십시작일,
                   e.end_date::text   AS 멤버십종료일,
                   e.total_cnt    AS 총횟수,
                   e.used_cnt     AS 사용횟수,
                   e.결제상태     AS 결제상태,
                   CASE WHEN r.contact IS NOT NULL THEN true ELSE false END AS 재등록여부
            FROM ending e
            LEFT JOIN renewed r ON r.contact = e.contact
            ORDER BY e.end_date DESC, e.name
        """, (trainer_name, branch, s, e, s, end_plus30))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"start": start, "end": end, "trainer_name": trainer_name, "branch": branch, "count": len(rows)}}


@router.get("/active-members")
def trainer_active_members(
    trainer_name: str = Query(...),
    branch: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """기간 내 유효한 정규 PT 멤버십 회원 목록.

    판정: 멤버십시작일 ≤ 기간말 AND 멤버십종료일 ≥ 기간초
    (여러 멤버십이 겹치면 각각 한 행)
    """
    start, end = _normalize_period(start, end)
    s, e = _period_range(start, end)
    with safe_db("replica") as (_conn, cur):
        cur.execute(f"""
            SELECT "회원이름"           AS 회원이름,
                   "회원연락처"         AS 회원연락처,
                   "멤버십명"           AS 멤버십명,
                   "멤버십시작일"::text  AS 멤버십시작일,
                   "멤버십종료일"::text  AS 멤버십종료일,
                   "총횟수"             AS 총횟수,
                   "사용횟수"           AS 사용횟수,
                   "잔여횟수"           AS 잔여횟수,
                   "결제상태"           AS 결제상태
            FROM raw_data_pt
            WHERE "담당트레이너" = %s
              AND "지점명" = %s
              AND "체험정규" = '정규'
              AND "총횟수" < 99999
              AND "멤버십시작일" <= %s::date
              AND "멤버십종료일" >= %s::date
              {_PT_PAID_FILTER}
            ORDER BY "멤버십종료일" DESC, "회원이름"
        """, (trainer_name, branch, e, s))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"start": start, "end": end, "trainer_name": trainer_name, "branch": branch, "count": len(rows)}}


@router.get("/member-purchases")
def member_purchases(
    contact: str = Query(...),
    start: str = Query(default=None),
    end: str = Query(default=None),
):
    """특정 회원의 기간 내 PT 구매 내역 (아코디언 확장용).

    기간 판정: 기간과 멤버십이 교차(`begin<=end AND end>=start`)하면 포함.
    """
    start, end = _normalize_period(start, end)
    s, e = _period_range(start, end)
    with safe_db("replica") as (_conn, cur):
        cur.execute("""
            SELECT "지점명"               AS 지점명,
                   "회원이름"             AS 회원이름,
                   "멤버십명"             AS 멤버십명,
                   "멤버십시작일"::text   AS 멤버십시작일,
                   "멤버십종료일"::text   AS 멤버십종료일,
                   "체험정규"             AS 체험정규,
                   "담당트레이너"         AS 담당트레이너,
                   "전환재등록"           AS 전환재등록,
                   "총횟수"               AS 총횟수,
                   "사용횟수"             AS 사용횟수,
                   "잔여횟수"             AS 잔여횟수,
                   "결제상태"             AS 결제상태
            FROM raw_data_pt
            WHERE "회원연락처" = %s
              AND "멤버십시작일" <= %s::date
              AND "멤버십종료일" >= %s::date
            ORDER BY "멤버십시작일" DESC, "멤버십종료일" DESC
        """, (contact, e, s))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"start": start, "end": end, "contact": contact, "count": len(rows)}}
