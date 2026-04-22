"""트레이너 평가 대시보드 replica DB 쿼리.

4개 지표를 월 단위로 트레이너×지점에 집계:
  1) 유효회원 수        : raw_data_pt (정규 멤버십)
  2) 월 세션 수         : raw_data_reservation (출석 PT)
  3) 체험전환율         : raw_data_pt.전환재등록 = '체험전환'
  4) 재등록률           : raw_data_pt.전환재등록 = '재등록'

모든 집계 단위: (trainer_user_id INT, branch TEXT)

공통 필터:
  - raw_data_pt 에는 `결제상태` 컬럼이 존재하지 않음(raw_data_mbs 에만 있음).
    환불 제외는 현재 불가 — 추후 raw_data_mbs JOIN 으로 구현 필요.
"""
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


# 환불 제외 필터 — raw_data_pt 에 "결제상태" 컬럼이 없어 비활성.
# 추후 raw_data_mbs JOIN 또는 다른 컬럼으로 대체 필요.
_PT_PAID_FILTER = ""


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


def fetch_trainer_completion(cur, start_month: str, end_month: str) -> list[dict]:
    """완료된 PT 멤버십의 소진 이력을 per-row 로 반환.

    **시작월 기준 cohort 집계용**:
      - 완료 판정: `raw_data_reservation` 에서 `예약취소='유지'` 건수 ≥ 총횟수
        · 유지된 예약 = 크레딧 차감 이벤트 (출석·결석 무관, 취소만 제외)
        · 회계상 "크레딧이 총횟수만큼 소진됨" 과 동일한 의미
        · `raw_data_pt."사용횟수"` 컬럼이 실무에서 일부 멤버십에 populated 되지 않는
          케이스가 확인되어, 더 신뢰성 있는 reservation 카운트로 대체
      - 소요일: 멤버십시작일 ~ N번째 유지된 예약 수업날짜

    raw_data_pt 기본 필터: 체험정규='정규', 총횟수 8~99998, 환불 아님, 시작일 ∈ [start, end]
    """
    cur.execute("""
        WITH candidates AS (
            SELECT pt.trainer_user_id,
                   pt."지점명"             AS branch,
                   MAX(pt."담당트레이너")  AS trainer_name,
                   MAX(pt."멤버십명")      AS membership_name,
                   MAX(pt."회원이름")      AS member_name,
                   pt."회원연락처"         AS contact,
                   pt."멤버십시작일"::date AS begin_date,
                   pt."멤버십종료일"::date AS end_date,
                   pt."총횟수"             AS total_sessions
            FROM raw_data_pt pt
            WHERE pt."체험정규" = '정규'
              AND pt."총횟수" BETWEEN 8 AND 99998
              AND pt.trainer_user_id IS NOT NULL
              AND TO_CHAR(pt."멤버십시작일"::date, 'YYYY-MM') BETWEEN %s AND %s
            GROUP BY pt.trainer_user_id, pt."지점명", pt."회원연락처",
                     pt."멤버십시작일", pt."멤버십종료일", pt."총횟수"
        ),
        ranked AS (
            SELECT c.trainer_user_id,
                   c.branch,
                   c.trainer_name,
                   c.membership_name,
                   c.member_name,
                   c.contact,
                   c.begin_date,
                   c.end_date,
                   c.total_sessions,
                   r."수업날짜"::date AS class_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY c.trainer_user_id, c.contact, c.begin_date
                       ORDER BY r."수업날짜", r."시작시간"
                   ) AS session_no
            FROM candidates c
            JOIN raw_data_reservation r
              ON r."회원연락처" = c.contact
             AND r."수업날짜" BETWEEN c.begin_date AND c.end_date
             AND r."예약취소" = '유지'
             AND r."멤버십명" ILIKE %s
        )
        SELECT trainer_user_id,
               branch,
               trainer_name,
               membership_name,
               member_name,
               contact,
               begin_date,
               end_date,
               total_sessions,
               class_date AS last_session_date,
               (class_date - begin_date) AS days_used
        FROM ranked
        WHERE session_no = total_sessions
    """, (start_month, end_month, "%PT%"))
    return [
        {
            "trainer_user_id": int(r["trainer_user_id"]),
            "branch": r["branch"],
            "trainer_name": r["trainer_name"],
            "membership_name": r["membership_name"],
            "member_name": r["member_name"],
            "contact": r["contact"],
            "begin_date": r["begin_date"],
            "end_date": r["end_date"],
            "total_sessions": int(r["total_sessions"]),
            "last_session_date": r["last_session_date"],
            "days_used": int(r["days_used"]),
        }
        for r in cur.fetchall()
    ]


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
