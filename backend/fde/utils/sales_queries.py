"""
실적분석 replica DB 쿼리 모듈.
ANALYSIS-LOG.md의 검증된 쿼리 7개를 Python 함수로 구현.
모든 쿼리는 날짜를 파라미터로 받음 (하드코딩 금지).
"""
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta


# 비구독 필터 (오류1 방지: 신재휴체/전당익미 필터 절대 사용 금지)
NON_SUB_FILTER = """
    AND "상품명" NOT LIKE '%%구독%%'
    AND "상품명" NOT LIKE '%%버핏레이스%%'
    AND "상품명" NOT LIKE '%%Voucher%%'
    AND "상품명" NOT LIKE '%%제휴%%'
"""

# 공통 결제 필터
PAYMENT_FILTER = """
    AND "가격" > 0
    AND COALESCE("결제상태", '') != '전체환불'
"""

# 제외 상품 필터 (BS 1회차)
BS1_EXCLUDE_FILTER = """
    AND "상품명" NOT LIKE '%%제휴%%'
    AND "상품명" NOT LIKE '%%모비스%%'
    AND "상품명" NOT LIKE '%%위메이드%%'
"""


def fetch_branch_revenue(cur, start_date: str, end_date: str) -> dict:
    """
    쿼리 2-1: 지점별 매출 (FT+PT).
    오류3 방지: raw_data_mbs + raw_data_revenue_cash 반드시 합산. 정규만 집계 금지.
    """
    # MBS 기반 매출
    cur.execute(f"""
        SELECT "지점명",
            SUM(CASE WHEN "카테고리"='피트니스' THEN "가격" ELSE 0 END) / 1.1 AS ft_mbs,
            SUM(CASE WHEN "카테고리" IN ('PT','대관') THEN "가격" ELSE 0 END) / 1.1 AS pt_mbs
        FROM raw_data_mbs
        WHERE "결제일" BETWEEN %s AND %s
            {PAYMENT_FILTER}
        GROUP BY "지점명"
    """, (start_date, end_date))
    mbs_rows = {r["지점명"]: r for r in cur.fetchall()}

    # revenue_cash 추가분
    cur.execute("""
        SELECT "지점명",
            SUM(CASE WHEN "카테고리" IN ('락커','운동복','옵션상품') THEN "가격_exvat" ELSE 0 END) AS ft_option,
            SUM(CASE WHEN "카테고리"='피트니스' AND "상품명" LIKE '%%1일%%' AND "결제상태"='정상' THEN "가격_exvat" ELSE 0 END) AS ft_daily,
            SUM(CASE WHEN "카테고리"='피트니스' AND "결제상태"='환불' THEN "가격_exvat" ELSE 0 END) AS ft_refund,
            SUM(CASE WHEN "카테고리"='PT' AND "결제상태"='환불' THEN "가격_exvat" ELSE 0 END) AS pt_refund,
            SUM(CASE WHEN "카테고리"='대관' AND "상품명" LIKE '%%안심%%' THEN "가격_exvat" ELSE 0 END) AS pt_ansim
        FROM raw_data_revenue_cash
        WHERE "결제일" BETWEEN %s AND %s
        GROUP BY "지점명"
    """, (start_date, end_date))
    cash_rows = {r["지점명"]: r for r in cur.fetchall()}

    # 합산
    branches = set(list(mbs_rows.keys()) + list(cash_rows.keys()))
    result = {}
    for branch in branches:
        m = mbs_rows.get(branch, {})
        c = cash_rows.get(branch, {})
        result[branch] = {
            "ft_mbs": int(m.get("ft_mbs") or 0),
            "ft_option": int(c.get("ft_option") or 0),
            "ft_daily": int(c.get("ft_daily") or 0),
            "ft_refund": int(c.get("ft_refund") or 0),
            "pt_mbs": int(m.get("pt_mbs") or 0),
            "pt_refund": int(c.get("pt_refund") or 0),
            "pt_ansim": int(c.get("pt_ansim") or 0),
        }
    return result


def fetch_ft_new(cur, start_date: str, end_date: str) -> dict:
    """
    쿼리 2-2: FT BS 1회차 지점별.
    오류5 방지: mbs회차_lifetime_정규체험=1 조건 사용. N회차 합산 금지.
    """
    def _query_bs1(s, e):
        cur.execute(f"""
            SELECT "지점명",
                COUNT(DISTINCT CASE
                    WHEN "카테고리"='피트니스' AND "체험정규"='정규'
                        AND "신재휴체"='신규' AND "mbs회차_lifetime_정규체험"=1
                        {BS1_EXCLUDE_FILTER}
                    THEN mbs_id END) AS bs1,
                SUM(CASE
                    WHEN "카테고리"='피트니스' AND "체험정규"='정규'
                        AND "신재휴체"='신규' AND "mbs회차_lifetime_정규체험"=1
                        AND "상품명" NOT LIKE '%%제휴%%'
                        AND "상품명" NOT LIKE '%%모비스%%'
                        AND "상품명" NOT LIKE '%%위메이드%%'
                    THEN "가격" / 1.1 ELSE 0 END) AS bs1_revenue
            FROM raw_data_mbs
            WHERE "결제일" BETWEEN %s AND %s
                {PAYMENT_FILTER}
            GROUP BY "지점명"
        """, (s, e))
        return {r["지점명"]: r for r in cur.fetchall()}

    sd = date.fromisoformat(start_date)
    ed = date.fromisoformat(end_date)
    day_of_month = ed.day

    # 당월
    current = _query_bs1(start_date, end_date)

    # 전월 동기간
    prev_month_start = (sd - relativedelta(months=1)).isoformat()
    prev_month_same_end = ((sd - relativedelta(months=1)).replace(day=min(day_of_month, 28))).isoformat()
    try:
        prev_month_same_end = (sd - relativedelta(months=1)).replace(day=day_of_month).isoformat()
    except ValueError:
        prev_month_same_end = ((sd - relativedelta(months=1)) + relativedelta(months=1) - timedelta(days=1)).isoformat()
    prev_month_same = _query_bs1(prev_month_start, prev_month_same_end)

    # 전년 동기간
    prev_year_start = (sd - relativedelta(years=1)).isoformat()
    try:
        prev_year_same_end = (sd - relativedelta(years=1)).replace(day=day_of_month).isoformat()
    except ValueError:
        prev_year_same_end = ((sd - relativedelta(years=1)) + relativedelta(months=1) - timedelta(days=1)).isoformat()
    prev_year_same = _query_bs1(prev_year_start, prev_year_same_end)

    # 전월 전체
    prev_month_full_start = prev_month_start
    prev_month_full_end = ((sd - relativedelta(months=1)) + relativedelta(months=1) - timedelta(days=1)).isoformat()
    prev_month_full = _query_bs1(prev_month_full_start, prev_month_full_end)

    # 전년 동월 전체
    prev_year_full_start = prev_year_start
    prev_year_full_end = ((sd - relativedelta(years=1)) + relativedelta(months=1) - timedelta(days=1)).isoformat()
    prev_year_full = _query_bs1(prev_year_full_start, prev_year_full_end)

    branches = set(list(current.keys()) + list(prev_month_same.keys()) + list(prev_year_same.keys()))
    result = {}
    for branch in branches:
        c = current.get(branch, {})
        result[branch] = {
            "bs1_count": int(c.get("bs1") or 0),
            "bs1_revenue": int(c.get("bs1_revenue") or 0),
            "prev_month_same_period": int((prev_month_same.get(branch) or {}).get("bs1") or 0),
            "prev_year_same_period": int((prev_year_same.get(branch) or {}).get("bs1") or 0),
            "prev_month_full": int((prev_month_full.get(branch) or {}).get("bs1") or 0),
            "prev_year_full": int((prev_year_full.get(branch) or {}).get("bs1") or 0),
        }
    return result


def fetch_pt_trial(cur, start_date: str, end_date: str) -> dict:
    """
    쿼리 2-3: PT 체험권 (단독 vs 결합).
    """
    # 전체 체험권
    cur.execute(f"""
        SELECT "지점명",
            COUNT(DISTINCT mbs_id) AS trial_count,
            SUM("가격" / 1.1) AS trial_revenue
        FROM raw_data_mbs
        WHERE "카테고리"='PT' AND "체험정규"='체험'
            AND "결제일" BETWEEN %s AND %s
            {PAYMENT_FILTER}
        GROUP BY "지점명"
    """, (start_date, end_date))
    trial_rows = {r["지점명"]: r for r in cur.fetchall()}

    # 결합구매 (같은 날 PT정규 동시결제)
    cur.execute(f"""
        SELECT t."지점명", COUNT(DISTINCT t.mbs_id) AS combo
        FROM raw_data_mbs t
        JOIN raw_data_mbs r ON r.user_id = t.user_id AND r."지점명" = t."지점명"
            AND r."카테고리" = 'PT' AND r."체험정규" = '정규'
            AND r."결제일" = t."결제일" AND r.mbs_id != t.mbs_id
        WHERE t."카테고리" = 'PT' AND t."체험정규" = '체험'
            AND t."결제일" BETWEEN %s AND %s
            AND t."가격" > 0 AND COALESCE(t."결제상태",'') != '전체환불'
        GROUP BY t."지점명"
    """, (start_date, end_date))
    combo_rows = {r["지점명"]: int(r["combo"]) for r in cur.fetchall()}

    branches = set(list(trial_rows.keys()) + list(combo_rows.keys()))
    result = {}
    for branch in branches:
        t = trial_rows.get(branch, {})
        total = int(t.get("trial_count") or 0)
        combo = combo_rows.get(branch, 0)
        result[branch] = {
            "trial_count": total,
            "trial_revenue": int(t.get("trial_revenue") or 0),
            "solo_count": total - combo,
            "combo_count": combo,
        }
    return result


def fetch_pt_conversion(cur, start_date: str, end_date: str) -> dict:
    """
    쿼리 2-6: PT 체험전환율 지점별.
    """
    target_month_start = start_date[:8] + "01"
    cur.execute(f"""
        SELECT "지점명",
            COUNT(DISTINCT CASE WHEN "카테고리"='PT' AND "체험정규"='체험'
                AND DATE_TRUNC('month', "종료일") = %s::date
                AND "상품명" NOT LIKE '%%임직원%%' AND "상품명" NOT LIKE '%%패밀리%%'
                THEN "연락처" END) AS 대상자,
            COUNT(DISTINCT CASE WHEN "카테고리"='PT' AND "체험정규"='정규'
                AND ("신재휴체"='체험후전환' OR "mbs2_cat_동시구매"='동시구매')
                AND "결제일" BETWEEN %s AND %s
                AND "상품명" NOT LIKE '%%임직원%%' AND "상품명" NOT LIKE '%%패밀리%%'
                THEN "연락처" END) AS 전환자
        FROM raw_data_mbs
        WHERE {PAYMENT_FILTER.replace('AND ', '', 1)}
            AND (
                ("카테고리"='PT' AND "체험정규"='체험' AND DATE_TRUNC('month', "종료일") = %s::date)
                OR ("카테고리"='PT' AND "체험정규"='정규' AND "결제일" BETWEEN %s AND %s)
            )
        GROUP BY "지점명"
    """, (target_month_start, start_date, end_date, target_month_start, start_date, end_date))
    rows = {r["지점명"]: r for r in cur.fetchall()}

    result = {}
    for branch, r in rows.items():
        result[branch] = {
            "conversion_target": int(r.get("대상자") or 0),
            "conversion_count": int(r.get("전환자") or 0),
        }
    return result


def fetch_ft_rereg(cur, target_month: str, end_date: str) -> dict:
    """
    쿼리 2-4: FT 기간권 재등록률.
    오류1 방지: 신재휴체/전당익미 필터 절대 사용 금지. 종료월 기준 전체.
    재등록률 = (결제자 + 기결제자) ÷ 대상자
    """
    year, month = int(target_month[:4]), int(target_month[5:7])
    # 당대당/전대당/익대당 3개월 범위
    d = date(year, month, 1)
    prev_month = (d - relativedelta(months=1)).strftime("%Y-%m")
    next_month = (d + relativedelta(months=1)).strftime("%Y-%m")
    target_months = [prev_month, target_month, next_month]

    cur.execute(f"""
        SELECT "지점명", "연락처", "상품명", "종료일",
            "mbs2_cat_카테고리", "mbs2_cat_체험정규", "mbs2_cat_결제일", "mbs2_cat_상품명", "mbs2_cat_id",
            TO_CHAR("종료일", 'YYYY-MM') AS 종료월
        FROM raw_data_mbs
        WHERE "카테고리"='피트니스' AND "체험정규"='정규'
            AND "결제상태" = '정상' AND "가격" > 0
            AND TO_CHAR("종료일", 'YYYY-MM') IN %s
    """, (tuple(target_months),))
    rows = cur.fetchall()

    def is_non_sub(name):
        if not name:
            return True
        name = name.lower()
        return not any(kw in name for kw in ["구독", "버핏레이스", "voucher", "제휴"])

    def has_mbs2_rereg(r):
        return (r.get("mbs2_cat_카테고리") == "피트니스"
                and r.get("mbs2_cat_체험정규") == "정규"
                and r.get("mbs2_cat_id"))

    # 당대당 (종료월=당월, 어제까지)
    by_branch = {}
    for r in rows:
        end_m = r.get("종료월")
        if end_m != target_month:
            continue
        if not is_non_sub(r.get("상품명")):
            continue
        # 오류2 방지: end_date 필수. 월말 기본값 사용 금지.
        if r["종료일"] and str(r["종료일"])[:10] > end_date:
            continue

        branch = r["지점명"]
        if branch not in by_branch:
            by_branch[branch] = {"targets": set(), "paid": set(), "pre_paid": set()}

        contact = r["연락처"]
        by_branch[branch]["targets"].add(contact)

        if has_mbs2_rereg(r):
            mbs2_date = str(r.get("mbs2_cat_결제일", ""))[:7]
            if mbs2_date == target_month:
                by_branch[branch]["paid"].add(contact)
            elif mbs2_date < target_month:
                by_branch[branch]["pre_paid"].add(contact)

    result = {}
    for branch, data in by_branch.items():
        target_count = len(data["targets"])
        paid_count = len(data["paid"])
        pre_paid_count = len(data["pre_paid"])
        rereg_rate = round((paid_count + pre_paid_count) / target_count * 100, 1) if target_count > 0 else 0
        result[branch] = {
            "target_count": target_count,
            "paid_count": paid_count,
            "pre_paid_count": pre_paid_count,
            "rereg_rate": rereg_rate,
        }
    return result


def fetch_subscription_churn(cur, start_date: str, end_date: str) -> dict:
    """
    쿼리 2-5: 구독 이탈 분석.
    오류2 방지: end_date 필수. 종료일 <= end_date 조건 하드코딩.
    오류4: 회차별 이탈률은 의도적으로 제외.
    """
    cur.execute(f"""
        SELECT "지점명", "이용상태", "종료일",
            mbs_id, user_id, "상품명",
            "mbs2_cat_id", "mbs2_cat_결제일", "mbs2_cat_상품명",
            "mbs2_cat_카테고리", "mbs2_cat_체험정규"
        FROM raw_data_mbs
        WHERE "카테고리" = '피트니스'
            AND COALESCE("상품명",'') LIKE '%%구독%%'
            AND "가격" > 0
            AND COALESCE("결제상태",'') != '전체환불'
            AND "종료일" >= %s AND "종료일" <= %s
    """, (start_date, end_date))
    rows = cur.fetchall()

    by_branch = {}
    for r in rows:
        branch = r["지점명"]
        if branch not in by_branch:
            by_branch[branch] = {
                "total": 0, "maintain": 0, "return": 0,
                "term_convert": 0, "churn": 0,
                "pending_cancel": 0, "undecided": 0,
            }
        by_branch[branch]["total"] += 1

        classification = _classify_row(r)
        if classification in ("유지",):
            by_branch[branch]["maintain"] += 1
        elif classification in ("당월복귀", "익월복귀", "휴면복귀"):
            by_branch[branch]["return"] += 1
        elif classification == "기간권전환":
            by_branch[branch]["term_convert"] += 1
        elif classification == "해지예정":
            by_branch[branch]["pending_cancel"] += 1
        elif classification == "미확정":
            by_branch[branch]["undecided"] += 1
        else:  # 이탈
            by_branch[branch]["churn"] += 1

    result = {}
    for branch, data in by_branch.items():
        total = data["total"]
        churn_count = data["churn"] + data["pending_cancel"]
        churn_rate = round(churn_count / total * 100, 1) if total > 0 else 0
        result[branch] = {
            "total_count": total,
            "maintain_count": data["maintain"],
            "return_count": data["return"],
            "term_convert_count": data["term_convert"],
            "churn_count": data["churn"],
            "pending_cancel_count": data["pending_cancel"],
            "undecided_count": data["undecided"],
            "churn_rate": churn_rate,
        }
    return result


def _classify_row(r) -> str:
    """구독 이탈 분류 (대시보드 _classify_row 로직 재현)."""
    has_mbs2 = bool(r.get("mbs2_cat_id"))
    status = r.get("이용상태", "")

    if not has_mbs2:
        if status == "해지예약":
            return "해지예정"
        elif status in ("해지완료", "지난구독", "환불"):
            return "이탈"
        elif status == "이용중":
            return "미확정"
        return "이탈"

    mbs2_name = r.get("mbs2_cat_상품명") or ""
    mbs2_cat = r.get("mbs2_cat_카테고리") or ""
    mbs2_type = r.get("mbs2_cat_체험정규") or ""
    is_sub = "구독" in mbs2_name

    if not is_sub:
        if mbs2_cat == "피트니스" and mbs2_type == "정규":
            return "기간권전환"
        return "이탈"

    # 구독 → 구독: 지연일수로 유지/복귀 판단
    end_date = r.get("종료일")
    mbs2_date_str = str(r.get("mbs2_cat_결제일", ""))[:10]
    if end_date and mbs2_date_str:
        try:
            from datetime import datetime
            end_d = end_date if isinstance(end_date, date) else datetime.strptime(str(end_date)[:10], "%Y-%m-%d").date()
            mbs2_d = datetime.strptime(mbs2_date_str, "%Y-%m-%d").date()
            delay_days = (mbs2_d - end_d).days
            if delay_days <= 1:
                return "유지"
            end_month = end_d.strftime("%Y-%m")
            mbs2_month = mbs2_d.strftime("%Y-%m")
            if end_month == mbs2_month:
                return "당월복귀"
            # 익월
            next_m = (end_d + relativedelta(months=1)).strftime("%Y-%m")
            if mbs2_month == next_m:
                return "익월복귀"
            return "휴면복귀"
        except (ValueError, TypeError):
            return "유지"

    return "유지"


def fetch_targets(cur, year: int, month: int) -> dict:
    """쿼리 2-7: 목표 데이터."""
    cur.execute("""
        SELECT branch, category, item, sub_item, metric, SUM(value) AS total
        FROM business_plan_targets
        WHERE year = %s AND month = %s AND section = '세부실적'
        GROUP BY branch, category, item, sub_item, metric
    """, (year, month))
    rows = cur.fetchall()

    result = {}
    for r in rows:
        branch = r["branch"]
        if branch not in result:
            result[branch] = {}
        key = f"{r['category']}_{r['item']}_{r['sub_item']}_{r['metric']}"
        result[branch][key] = int(r["total"] or 0)
    return result
