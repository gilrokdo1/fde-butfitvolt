"""트레이너 평가 대시보드 replica DB 쿼리.

4개 지표를 월 단위로 트레이너×지점에 집계:
  1) 유효회원 수        : raw_data_pt (정규 멤버십)
  2) 월 세션 수         : raw_data_reservation (출석 PT)
  3) 체험전환율         : raw_data_pt.전환재등록 = '체험전환'
  4) 재등록률           : raw_data_pt.전환재등록 = '재등록'

모든 집계 단위: (trainer_user_id INT, branch TEXT)

공통 필터:
  - raw_data_pt: "결제상태"가 '전체환불'/'환불' 인 멤버십은 집계 제외 (계약이 취소된 건이라
    체험전환율/재등록률을 왜곡시킴). '부분환불'은 실제 이용이 있었으므로 포함.
"""
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


# 환불 멤버십 제외 (전체환불·환불 제외, 부분환불은 포함)
_PT_PAID_FILTER = "AND COALESCE(\"결제상태\", '') NOT IN ('전체환불', '환불')"


def _month_range(target_month: str) -> tuple[str, str]:
    """'YYYY-MM' → (월초, 월말) ISO."""
    y, m = int(target_month[:4]), int(target_month[5:7])
    start = date(y, m, 1)
    end = (start + relativedelta(months=1)) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def fetch_trainer_directory(cur) -> dict[int, str]:
    """user_btrainer id → name 매핑 (동명이인 tie-break용)."""
    cur.execute("""
        SELECT bt.id AS trainer_user_id, uu.name AS trainer_name
        FROM user_btrainer bt
        JOIN user_user uu ON uu.id = bt.user_id
    """)
    return {int(r["trainer_user_id"]): r["trainer_name"] for r in cur.fetchall()}


def fetch_trainer_active_members(cur, target_month: str) -> dict:
    """지표1: 월말 시점 유효한 정규 PT 멤버십 회원 수 per (trainer_user_id, branch).

    - 무제한(총횟수≥99999) 제외
    - 체험정규='정규'
    - 시작일 ≤ 월말 AND 종료일 ≥ 월초
    """
    start, end = _month_range(target_month)
    cur.execute(f"""
        SELECT trainer_user_id,
               "지점명" AS branch,
               MAX("담당트레이너") AS trainer_name,
               COUNT(DISTINCT "회원연락처") AS active_members
        FROM raw_data_pt
        WHERE "체험정규" = '정규'
          AND "멤버십시작일" <= %s::date
          AND "멤버십종료일" >= %s::date
          AND trainer_user_id IS NOT NULL
          AND "총횟수" < 99999
          {_PT_PAID_FILTER}
        GROUP BY trainer_user_id, "지점명"
    """, (end, start))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "active_members": int(r["active_members"] or 0),
        }
        for r in cur.fetchall()
    }


def fetch_trainer_sessions(cur, target_month: str) -> dict:
    """지표2: 출석한 PT 세션 수 per (trainer_user_id, branch).

    - 수업날짜 BETWEEN 월초 AND 월말
    - 예약취소='유지', 출석여부='출석'
    - 멤버십명 ILIKE '%PT%' (PT 세션 필터)
    - raw_data_reservation.트레이너(TEXT)를 user_btrainer와 name JOIN → trainer_user_id
    """
    start, end = _month_range(target_month)
    cur.execute("""
        SELECT bt.id AS trainer_user_id,
               MIN(uu.name) AS trainer_name,
               r."지점명" AS branch,
               COUNT(*) AS sessions_done
        FROM raw_data_reservation r
        JOIN user_user uu ON uu.name = r."트레이너"
        JOIN user_btrainer bt ON bt.user_id = uu.id
        WHERE r."수업날짜" BETWEEN %s AND %s
          AND r."예약취소" = '유지'
          AND r."출석여부" = '출석'
          AND r."멤버십명" ILIKE %s
        GROUP BY bt.id, r."지점명"
    """, (start, end, "%PT%"))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "sessions_done": int(r["sessions_done"] or 0),
        }
        for r in cur.fetchall()
    }


def fetch_trainer_conversion(cur, target_month: str) -> dict:
    """지표3: 체험전환율 per (trainer_user_id, branch).

    - 분모: target_month에 체험 멤버십이 종료된 회원 수
    - 분자: 그 중 전환재등록='체험전환' 인 회원 수
    - 귀속: 체험 멤버십의 trainer_user_id
    """
    start, end = _month_range(target_month)
    cur.execute(f"""
        SELECT trainer_user_id,
               "지점명" AS branch,
               MAX("담당트레이너") AS trainer_name,
               COUNT(DISTINCT "회원연락처") AS trial_end_count,
               COUNT(DISTINCT CASE WHEN "전환재등록" = '체험전환' THEN "회원연락처" END) AS trial_convert_count
        FROM raw_data_pt
        WHERE "체험정규" = '체험'
          AND "멤버십종료일" BETWEEN %s AND %s
          AND trainer_user_id IS NOT NULL
          {_PT_PAID_FILTER}
        GROUP BY trainer_user_id, "지점명"
    """, (start, end))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "trial_end_count": int(r["trial_end_count"] or 0),
            "trial_convert_count": int(r["trial_convert_count"] or 0),
        }
        for r in cur.fetchall()
    }


def fetch_trainer_rereg(cur, target_month: str) -> dict:
    """지표4: 재등록률 per (trainer_user_id, branch).

    - 분모: target_month에 정규 PT 멤버십이 종료된 회원 (무제한 제외)
    - 분자: 같은 회원이 종료 후 30일 내(= 다음 정규가 전환재등록='재등록') 다시 등록
    - 귀속: **이전(종료된) 멤버십의 trainer_user_id** (재계약을 유도한 주체)
    """
    start, end = _month_range(target_month)
    end_plus30 = (date.fromisoformat(end) + timedelta(days=30)).isoformat()
    cur.execute(f"""
        WITH ending AS (
            SELECT trainer_user_id,
                   "지점명" AS branch,
                   "회원연락처" AS contact,
                   MAX("담당트레이너") AS trainer_name
            FROM raw_data_pt
            WHERE "체험정규" = '정규'
              AND "멤버십종료일" BETWEEN %s AND %s
              AND "총횟수" < 99999
              AND trainer_user_id IS NOT NULL
              {_PT_PAID_FILTER}
            GROUP BY trainer_user_id, "지점명", "회원연락처"
        ),
        renewed AS (
            SELECT DISTINCT "회원연락처" AS contact
            FROM raw_data_pt
            WHERE "체험정규" = '정규'
              AND "전환재등록" = '재등록'
              AND "멤버십시작일" BETWEEN %s AND %s
              {_PT_PAID_FILTER}
        )
        SELECT e.trainer_user_id,
               e.branch,
               MAX(e.trainer_name) AS trainer_name,
               COUNT(DISTINCT e.contact) AS regular_end_count,
               COUNT(DISTINCT CASE WHEN r.contact IS NOT NULL THEN e.contact END) AS regular_rereg_count
        FROM ending e
        LEFT JOIN renewed r ON r.contact = e.contact
        GROUP BY e.trainer_user_id, e.branch
    """, (start, end, start, end_plus30))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "regular_end_count": int(r["regular_end_count"] or 0),
            "regular_rereg_count": int(r["regular_rereg_count"] or 0),
        }
        for r in cur.fetchall()
    }
