"""트레이너 평가 대시보드 replica DB 쿼리.

4개 지표를 월 단위로 트레이너×지점에 집계:
  1) 유효회원 수        : raw_data_pt (정규 멤버십)
  2) 월 세션 수         : raw_data_reservation (프로그램명='PT', 유지된 예약 — 결석 포함)
  3) 체험전환율         : raw_data_pt.전환재등록 = '체험전환'
  4) 재등록률           : raw_data_pt.전환재등록 = '재등록'

모든 집계 단위: (trainer_user_id INT, branch TEXT)

공통 필터:
  - 환불 제외: `raw_data_pt."환불여부"` 컬럼 사용 (ERP /pt/trainer 와 동일 로직).
    raw_data_pt 에 "결제상태" 컬럼은 없고, raw_data_mbs 에만 있음. 환불 판정은
    "환불여부" 컬럼 하나로 충분 (ERP 기준).
"""
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


# 환불 제외 필터 — ERP /pt/trainer 와 동일.
_PT_PAID_FILTER = "AND (\"환불여부\" IS NULL OR \"환불여부\" != '환불')"

# 비정규 상품 제외 — 무제한권(총횟수≥99999) + 쿠폰팩·이벤트성 상품.
# ERP 는 무제한권을 제외하지 않지만, FDE 는 트레이너 평가 관점에서 명시적 제외.
# 실제 raw_data_pt 에 등장하는 상품명은 /debug/non-regular-products 로 확인 후 반영.
_COUPON_PATTERN = r'(쿠폰|이벤트|체험팩|무료|증정|선물|복지)'


def _non_regular_exclude(alias: str = "") -> str:
    """비정규 상품 제외 SQL 단편. `alias=""` 면 raw 컬럼, `alias="p2"` 면 p2 테이블 alias."""
    prefix = f"{alias}." if alias else ""
    name_col = f'{prefix}"멤버십명"'
    total_col = f'{prefix}"총횟수"'
    return (
        f'AND {total_col} < 99999 '
        f"AND ({name_col} IS NULL OR {name_col} !~* '{_COUPON_PATTERN}')"
    )


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
    """지표1: 월 내 한 번이라도 활성이었던 PT 멤버십 회원 수 per (trainer_user_id, branch).

    - 정규·체험 **별도 카운트** 반환 (프론트 토글로 선택)
    - 환불 제외 + 비정규 상품 (쿠폰팩·무제한권) 제외
    - 시작일 ≤ 월말 AND 종료일 ≥ 월초
    - trainer_user_id NULL 인 경우도 포함 (COALESCE(0) 처리, ERP 와 동일)
    """
    start, end = _month_range(target_month)
    excl = _non_regular_exclude()
    cur.execute(f"""
        SELECT COALESCE(trainer_user_id, 0) AS trainer_user_id,
               "지점명" AS branch,
               MAX("담당트레이너") AS trainer_name,
               COUNT(DISTINCT CASE WHEN "체험정규" = '정규' THEN "회원연락처" END) AS active_regular,
               COUNT(DISTINCT CASE WHEN "체험정규" = '체험' THEN "회원연락처" END) AS active_trial,
               COUNT(DISTINCT "회원연락처") AS active_all
        FROM raw_data_pt
        WHERE "멤버십시작일" <= %s::date
          AND "멤버십종료일" >= %s::date
          AND "담당트레이너" IS NOT NULL
          AND "담당트레이너" != ''
          {_PT_PAID_FILTER}
          {excl}
        GROUP BY trainer_user_id, "지점명"
    """, (end, start))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "active_regular": int(r["active_regular"] or 0),
            "active_trial": int(r["active_trial"] or 0),
            "active_all": int(r["active_all"] or 0),
        }
        for r in cur.fetchall()
    }


def fetch_trainer_sessions(cur, target_month: str) -> dict:
    """지표2: PT 세션 수 per (trainer_user_id, branch).

    - 수업날짜 BETWEEN 월초 AND 월말
    - 예약취소='유지' (결석 포함)
    - 프로그램명='PT'
    - raw_data_reservation.트레이너(TEXT) → user_btrainer JOIN → trainer_user_id
    - TODO (PR D): ERP 방식 (trainer_name 문자열 그대로) 으로 전환 검토
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
          AND r."프로그램명" = 'PT'
        GROUP BY bt.id, r."지점명"
    """, (start, end))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "sessions_done": int(r["sessions_done"] or 0),
        }
        for r in cur.fetchall()
    }


def fetch_trainer_conversion(cur, target_month: str) -> dict:
    """지표3: 체험전환율 per (trainer_user_id, branch) — ERP /pt/trainer 원문 SQL 구조.

    분모: "전환재등록" IN ('체험전환','미전환') AND 멤버십종료일 ∈ 월
    분자: 그 중 "전환재등록" = '체험전환'
    + 환불 제외 + 비정규 상품 제외
    """
    start, end = _month_range(target_month)
    excl = _non_regular_exclude()
    cur.execute(f"""
        SELECT COALESCE(trainer_user_id, 0) AS trainer_user_id,
               "지점명" AS branch,
               MAX("담당트레이너") AS trainer_name,
               COUNT(*) AS trial_end_count,
               COUNT(*) FILTER (WHERE "전환재등록" = '체험전환') AS trial_convert_count
        FROM raw_data_pt
        WHERE "전환재등록" IN ('체험전환', '미전환')
          AND "멤버십종료일" BETWEEN %s AND %s
          AND "담당트레이너" IS NOT NULL
          AND "담당트레이너" != ''
          {_PT_PAID_FILTER}
          {excl}
        GROUP BY trainer_user_id, "지점명"
        HAVING COUNT(*) > 0
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
    inner_excl = _non_regular_exclude("pt")
    cur.execute(f"""
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
              AND (pt."환불여부" IS NULL OR pt."환불여부" != '환불')
              AND TO_CHAR(pt."멤버십시작일"::date, 'YYYY-MM') BETWEEN %s AND %s
              {inner_excl}
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
    """지표4: 재등록률 per (trainer_user_id, branch) — ERP /pt/trainer 원문 SQL 구조.

    분모:
      ("전환재등록" IN ('재등록','휴면','미등록')) OR ("전환재등록" IS NULL AND "체험정규" IS NULL)
      + 환불 제외 + 멤버십종료일 ∈ 월
    분자:
      "전환재등록" = '재등록'
      OR ("전환재등록" IS NULL AND "체험정규" IS NULL
          AND EXISTS (후속 정규 PT — 윈도우 제한 없음))

    차이 (ERP 원문 vs FDE):
      - ERP 는 윈도우 제한 없음 (이전엔 FDE가 45일로 제한했으나 원문 확인 후 제거)
      - ERP 는 `총횟수 < 99999` 없음 → FDE 는 `_non_regular_exclude()` 로 별도 쿼리 레벨 제외
      - ERP 는 `trainer_user_id IS NOT NULL` 없음 → FDE 는 이 조건 제거
    """
    start, end = _month_range(target_month)
    outer_excl = _non_regular_exclude()
    inner_excl = _non_regular_exclude("p2")
    cur.execute(f"""
        SELECT COALESCE(trainer_user_id, 0) AS trainer_user_id,
               "지점명" AS branch,
               MAX("담당트레이너") AS trainer_name,
               COUNT(*) AS regular_end_count,
               COUNT(*) FILTER (
                   WHERE "전환재등록" = '재등록'
                      OR ("전환재등록" IS NULL AND "체험정규" IS NULL
                          AND EXISTS (
                              SELECT 1 FROM raw_data_pt p2
                              WHERE p2.user_id = raw_data_pt.user_id
                                AND p2."멤버십시작일" > raw_data_pt."멤버십종료일"
                                AND (p2."체험정규" IS NULL OR p2."체험정규" = '정규')
                                AND (p2."환불여부" IS NULL OR p2."환불여부" != '환불')
                                {inner_excl}
                          ))
               ) AS regular_rereg_count
        FROM raw_data_pt
        WHERE ("전환재등록" IN ('재등록', '휴면', '미등록')
               OR ("전환재등록" IS NULL AND "체험정규" IS NULL))
          AND ("환불여부" IS NULL OR "환불여부" != '환불')
          AND "멤버십종료일" BETWEEN %s AND %s
          AND "담당트레이너" IS NOT NULL
          AND "담당트레이너" != ''
          {outer_excl}
        GROUP BY trainer_user_id, "지점명"
        HAVING COUNT(*) > 0
    """, (start, end))
    return {
        (int(r["trainer_user_id"]), r["branch"]): {
            "trainer_name": r["trainer_name"],
            "regular_end_count": int(r["regular_end_count"] or 0),
            "regular_rereg_count": int(r["regular_rereg_count"] or 0),
        }
        for r in cur.fetchall()
    }
