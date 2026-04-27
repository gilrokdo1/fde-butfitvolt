"""신도림 시트 CSV → 이관용 JSON 변환기.

입력:
  budget_migration/sindorim_budget.csv      (경영계획 예산 VAT+ 블록)
  budget_migration/sindorim_expenses.csv    (지출관리 탭 전체)

출력:
  budget_migration/sindorim_migration.json  (백엔드 이관 API가 받을 형식)

실행:
  python3 budget_migration/parse_sindorim.py

이 스크립트는 DB에 직접 쓰지 않고 JSON만 생성한다.
실제 DB 반영은 배포된 백엔드의 POST /fde-api/yewon/budget/migrate/sindorim 이 담당.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from collections import Counter

HERE = Path(__file__).parent
BUDGET_CSV = HERE / "sindorim_budget.csv"
EXPENSES_CSV = HERE / "sindorim_expenses.csv"
OUTPUT_JSON = HERE / "sindorim_migration.json"

# ── 지출 CSV 원본 컬럼 순서 (row[1]~row[13]) ────────────────────────────────
COL_STATUS = 1      # "결제완료"
COL_ORDER_DATE = 2  # "2026. 1. 5"
COL_ACC_MONTH = 3   # "2026-01"
COL_RECEIPT = 4     # "TRUE"/"FALSE"
COL_WRITER = 5      # "박영준"
COL_ACCOUNT = 6     # "샤워실/탈의실(고객용 소모품)"  ← 빈값이면 미정
COL_ITEM = 7
COL_UNIT_PRICE = 8
COL_QUANTITY = 9
COL_SHIPPING = 10
COL_TOTAL = 11
COL_NOTE = 12
COL_URL = 13


def parse_int_won(s: str) -> int:
    """시트 숫자 '19,900' / '"103,570"' → 19900"""
    s = (s or "").strip().strip('"').replace(",", "")
    if s == "" or s == "-":
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def parse_order_date(s: str) -> str | None:
    """시트 날짜 '2026. 1. 5' → '2026-01-05'. 파싱 실패시 None."""
    s = (s or "").strip()
    if not s:
        return None
    # '2026. 1. 5' 또는 '2026.1.5' 모두 허용
    m = re.match(r"^\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*$", s)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def parse_acc_month(s: str) -> tuple[int, int] | None:
    """귀속연월 '2026-01' → (2026, 1)."""
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{1,2})$", s)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


# ── 예산 CSV 파서 ───────────────────────────────────────────────────────────

def parse_budget_csv() -> dict:
    """신도림 예산 CSV의 "1. 경영계획 예산(VAT+)" 블록만 뽑아
    {year, rows: [{account_name, months: {1: amount, ...}}]} 구조로 변환.
    """
    with open(BUDGET_CSV, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # "1. 경영계획 예산(VAT+)" 찾기
    start_idx = None
    for i, r in enumerate(rows):
        if any("경영계획 예산(VAT+)" in c for c in r):
            start_idx = i
            break
    if start_idx is None:
        raise RuntimeError("CSV에서 '경영계획 예산(VAT+)' 블록을 찾을 수 없습니다")

    # +1 행은 월 헤더, +2 행부터 데이터
    header_row = rows[start_idx + 1]
    if header_row[3:15] != [f"{m}월" for m in range(1, 13)]:
        raise RuntimeError(f"월 헤더가 예상과 다릅니다: {header_row[3:15]}")

    # 데이터는 다음 빈 행 나올 때까지
    data: list[dict] = []
    i = start_idx + 2
    while i < len(rows):
        r = rows[i]
        # r[2]에 소카테고리 이름이 있음 (r[1]은 대카테고리, 빈 경우도 있음)
        account_name = (r[2] if len(r) > 2 else "").strip()
        if not account_name:
            break
        months: dict[int, int] = {}
        for m in range(1, 13):
            cell = r[2 + m] if len(r) > 2 + m else ""
            months[m] = parse_int_won(cell)
        data.append({
            "account_name": account_name,
            "months": months,
        })
        i += 1

    if not data:
        raise RuntimeError("예산 데이터 행이 비어있습니다")

    # 연도는 첫 지출 CSV에서 추출하거나 하드코딩. 시트 구조상 2026년.
    return {
        "year": 2026,
        "rows": data,
    }


# ── 지출 CSV 파서 ───────────────────────────────────────────────────────────

FIXED_COST_ACCOUNTS = ("세탁", "미화", "기본급")


def parse_fixed_costs_csv(year: int = 2026, limit_month: int = 4) -> list[dict]:
    """예산 CSV의 '2. 월별 실 지출 (VAT+)' 블록에서 고정비 3종만 추출.

    빈칸(미정산) → 스킵. 0 → 스킵 (의미 없음).
    각 월별로 "세탁 2026-01 월 청구" 같은 단건 지출 레코드 생성.
    """
    with open(BUDGET_CSV, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # "2. 월별 실 지출 (VAT+)" 블록 찾기
    start = None
    for i, r in enumerate(rows):
        if any("2. 월별 실 지출 (VAT+)" in c for c in r):
            start = i
            break
    if start is None:
        raise RuntimeError("'2. 월별 실 지출 (VAT+)' 블록을 찾을 수 없습니다")

    # +1: 월 헤더 / +2부터 데이터
    results: list[dict] = []
    for r in rows[start + 2:]:
        name = (r[2] if len(r) > 2 else "").strip()
        if not name:
            break
        if name not in FIXED_COST_ACCOUNTS:
            continue
        for m in range(1, min(limit_month, 12) + 1):
            cell = r[2 + m] if len(r) > 2 + m else ""
            s = cell.strip().strip('"').replace(",", "")
            if s == "" or s == "-":
                continue  # 미정산 → 스킵
            try:
                amount = int(float(s))
            except ValueError:
                continue
            if amount <= 0:
                continue
            results.append({
                "order_date": f"{year:04d}-{m:02d}-{_last_day_of_month(year, m):02d}",
                "accounting_year": year,
                "accounting_month": m,
                "account_name": name,
                "item_name": f"{name} {year}-{m:02d} 월 청구",
                "unit_price": amount,
                "quantity": 1,
                "shipping_fee": 0,
                "note": "시트 2.VAT+ 블록 고정비 이관",
                "receipt_url": None,
            })
    return results


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    from datetime import date, timedelta
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def parse_expenses_csv(limit_month: int = 4) -> tuple[list[dict], list[dict]]:
    """지출 CSV를 (expenses, skipped) 로 반환.

    - limit_month: 4월까지만 이관 (5월 예정 건 스킵, 이예원님 결정)
    - 계정 빈 값 → is_pending=True + pending_reason=note
    - 빈 행/헤더 행/섹션 설명 행은 스킵
    """
    with open(EXPENSES_CSV, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # 헤더 찾기 (row[1] == '구분')
    header_idx = None
    for i, r in enumerate(rows):
        if len(r) > 1 and r[1].strip() == "구분":
            header_idx = i
            break
    if header_idx is None:
        raise RuntimeError("CSV에서 '구분' 헤더 행을 찾을 수 없습니다")

    expenses: list[dict] = []
    skipped: list[dict] = []

    for i in range(header_idx + 1, len(rows)):
        r = rows[i]
        if len(r) < 12:
            continue

        status = (r[COL_STATUS] if len(r) > COL_STATUS else "").strip()
        order_raw = (r[COL_ORDER_DATE] if len(r) > COL_ORDER_DATE else "").strip()
        acc_raw = (r[COL_ACC_MONTH] if len(r) > COL_ACC_MONTH else "").strip()
        writer = (r[COL_WRITER] if len(r) > COL_WRITER else "").strip()
        item = (r[COL_ITEM] if len(r) > COL_ITEM else "").strip()
        unit_price = parse_int_won(r[COL_UNIT_PRICE] if len(r) > COL_UNIT_PRICE else "")
        quantity = parse_int_won(r[COL_QUANTITY] if len(r) > COL_QUANTITY else "")

        # 완전 빈 행
        if not status and not order_raw and not writer and not item and unit_price == 0:
            continue

        order_date = parse_order_date(order_raw)
        acc = parse_acc_month(acc_raw)

        # 필수 필드 검증
        if not order_date or not acc or not writer or not item or unit_price <= 0 or quantity <= 0:
            skipped.append({
                "row": i + 1,
                "reason": "필수 필드 누락/불량",
                "raw": {
                    "status": status, "order_date": order_raw, "acc": acc_raw,
                    "writer": writer, "item": item,
                    "unit_price": unit_price, "quantity": quantity,
                },
            })
            continue

        # 4월 이후(귀속월 기준) 스킵
        acc_year, acc_month = acc
        if acc_year > 2026 or (acc_year == 2026 and acc_month > limit_month):
            skipped.append({
                "row": i + 1,
                "reason": f"귀속월 {acc_year}-{acc_month:02d}은 이관 범위(2026-01~04) 밖",
                "item": item,
            })
            continue

        account = (r[COL_ACCOUNT] if len(r) > COL_ACCOUNT else "").strip()
        shipping = parse_int_won(r[COL_SHIPPING] if len(r) > COL_SHIPPING else "")
        note = (r[COL_NOTE] if len(r) > COL_NOTE else "").strip() or None
        url = (r[COL_URL] if len(r) > COL_URL else "").strip() or None

        is_pending = not account
        pending_reason = None
        if is_pending:
            # 카테고리 빈 값 → note를 사유로 (note도 없으면 "이관 시 미분류")
            pending_reason = note or "시트 이관 시 카테고리 미입력 건"

        expenses.append({
            "order_date": order_date,
            "accounting_year": acc_year,
            "accounting_month": acc_month,
            "created_by_name": writer,
            "account_name": account if not is_pending else None,
            "item_name": item,
            "unit_price": unit_price,
            "quantity": quantity,
            "shipping_fee": shipping,
            "note": note,
            "receipt_url": url,
            "is_pending": is_pending,
            "pending_reason": pending_reason,
        })

    return expenses, skipped


# ── 메인 ────────────────────────────────────────────────────────────────────

def main() -> None:
    budget = parse_budget_csv()
    expenses, skipped = parse_expenses_csv(limit_month=4)
    fixed_costs = parse_fixed_costs_csv(year=budget["year"], limit_month=4)

    writers = Counter(e["created_by_name"] for e in expenses)
    by_month = Counter(e["accounting_month"] for e in expenses)
    pending_count = sum(1 for e in expenses if e["is_pending"])
    fixed_by_account = Counter(e["account_name"] for e in fixed_costs)

    summary = {
        "branch_code": "sindorim",
        "year": budget["year"],
        "budget_row_count": len(budget["rows"]),
        "expense_count": len(expenses),
        "expense_by_month": dict(sorted(by_month.items())),
        "expense_by_writer": dict(writers.most_common()),
        "pending_count": pending_count,
        "skipped_count": len(skipped),
        "fixed_cost_count": len(fixed_costs),
        "fixed_cost_by_account": dict(fixed_by_account),
    }

    output = {
        "summary": summary,
        "budget": budget,
        "expenses": expenses,
        "fixed_costs": fixed_costs,
        "skipped": skipped,
    }

    OUTPUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== 파싱 결과 요약 ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print(f"\n출력 파일: {OUTPUT_JSON}")
    if skipped:
        print(f"\n⚠️ 스킵된 {len(skipped)}건:")
        for s in skipped[:10]:
            print(f"  row {s.get('row')}: {s['reason']}")
        if len(skipped) > 10:
            print(f"  ... 외 {len(skipped) - 10}건")


if __name__ == "__main__":
    main()
