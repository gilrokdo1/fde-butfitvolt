"""범용 지점 시트 CSV → 이관용 JSON 변환기.

사용:
  python3 budget_migration/parse_branch.py <branch_code> <budget_csv> <expenses_csv>

예:
  python3 budget_migration/parse_branch.py gasan \\
    budget_migration/gasan/budget.csv \\
    budget_migration/gasan/expenses.csv

출력:
  <expenses_csv가 있는 폴더>/migration.json

신도림 파일럿 때 만든 parse_sindorim.py 의 로직을 그대로 일반화.
컬럼 순서·번호·시트 구조는 14개 지점 모두 동일하다는 가정.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

# ── 지출 CSV 원본 컬럼 순서 (row[1]~row[13]) ────────────────────────────────
COL_STATUS = 1
COL_ORDER_DATE = 2
COL_ACC_MONTH = 3
COL_RECEIPT = 4
COL_WRITER = 5
COL_ACCOUNT = 6
COL_ITEM = 7
COL_UNIT_PRICE = 8
COL_QUANTITY = 9
COL_SHIPPING = 10
COL_TOTAL = 11
COL_NOTE = 12
COL_URL = 13

FIXED_COST_ACCOUNTS = ("세탁", "미화", "기본급")


def parse_int_won(s: str) -> int:
    """시트 숫자 '19,900' / '"103,570"' / '-30000' → int."""
    s = (s or "").strip().strip('"').replace(",", "").replace("(", "-").replace(")", "")
    if s == "" or s == "-":
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def parse_order_date(s: str) -> str | None:
    """여러 날짜 포맷을 'YYYY-MM-DD'로 정규화.

    지원:
    - '2026. 1. 5'   (신도림)
    - '2026. 01. 05.'  (가산, 끝점 포함 가능)
    - '2026-01-09'   (역삼GFC, ISO 형식)
    - '2026/1/5'     (혹시)
    """
    s = (s or "").strip().rstrip(".").strip()
    if not s:
        return None
    # 점·하이픈·슬래시 모두 받기
    m = re.match(r"^\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*$", s)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def parse_acc_month(s: str) -> tuple[int, int] | None:
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{1,2})$", s)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def parse_budget_csv(path: Path) -> dict:
    """예산 CSV의 '1. 경영계획 예산(VAT+)' 블록만 뽑아 일관 구조로 변환."""
    with open(path, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    start = None
    for i, r in enumerate(rows):
        if any("경영계획 예산(VAT+)" in c for c in r):
            start = i
            break
    if start is None:
        raise RuntimeError(f"'경영계획 예산(VAT+)' 블록을 찾을 수 없습니다: {path}")

    header = rows[start + 1]
    expected = [f"{m}월" for m in range(1, 13)]
    if header[3:15] != expected:
        raise RuntimeError(f"월 헤더 불일치: {header[3:15]}")

    data: list[dict] = []
    i = start + 2
    while i < len(rows):
        r = rows[i]
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

    return {"year": 2026, "rows": data}


def parse_fixed_costs_csv(path: Path, year: int = 2026, limit_month: int = 4) -> list[dict]:
    """예산 CSV의 '2. 월별 실 지출 (VAT+)' 블록에서 고정비 3종만 추출."""
    with open(path, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    start = None
    for i, r in enumerate(rows):
        if any("2. 월별 실 지출 (VAT+)" in c for c in r):
            start = i
            break
    if start is None:
        raise RuntimeError("'2. 월별 실 지출 (VAT+)' 블록을 찾을 수 없습니다")

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
                continue
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


def parse_expenses_csv(path: Path, limit_month: int = 4) -> tuple[list[dict], list[dict]]:
    """지출 CSV → (expenses, skipped)."""
    with open(path, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    header_idx = None
    for i, r in enumerate(rows):
        if len(r) > 1 and r[1].strip() == "구분":
            header_idx = i
            break
    if header_idx is None:
        raise RuntimeError("'구분' 헤더 행을 찾을 수 없습니다")

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

        if not status and not order_raw and not writer and not item and unit_price == 0:
            continue

        order_date = parse_order_date(order_raw)
        acc = parse_acc_month(acc_raw)

        # 귀속연월 빈칸은 시트의 SUMIFS 집계에서도 제외되므로 스킵 (시트 정합성)

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

        # 음수 배송비 = 쿠폰·포인트 할인. DB는 shipping_fee >= 0 제약 →
        # 수량 1로 합쳐 단일 행에 적용 (단가 = 시트 총액). 원본 정보는 note 보존.
        if shipping < 0:
            discount = -shipping
            adjusted_total = unit_price * quantity - discount
            if adjusted_total > 0:
                discount_note = (
                    f"쿠폰/포인트 -{discount:,}원 적용 "
                    f"(원단가 {unit_price:,} × 수량 {quantity})"
                )
                note = f"{note} | {discount_note}" if note else discount_note
                unit_price = adjusted_total
                quantity = 1
                shipping = 0
            else:
                # 할인이 총액을 넘는 비정상 — 0원 처리 안 하고 원본 그대로 (스킵)
                shipping = 0

        # "상품매입" 등 시드에 없는 카테고리 → 미정 처리 (이예원님이 재분류)
        SEEDED = {
            "데스크/백오피스",
            "샤워실/탈의실(고객용 소모품)",
            "청소/미화 소모품",
            "(BG) 소도구/기구소모품/가구",
            "수건/운동복",
            "회원 리워드",
            "운반비",
            "세탁",
            "미화",
            "기본급",
        }
        is_pending = not account or account not in SEEDED
        pending_reason = None
        if is_pending:
            if not account:
                pending_reason = note or "시트 이관 시 카테고리 미입력 건"
            else:
                pending_reason = f"시드에 없는 카테고리: '{account}'" + (f" — {note}" if note else "")

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


def run(branch_code: str, budget_csv: Path, expenses_csv: Path, output_json: Path) -> dict:
    budget = parse_budget_csv(budget_csv)
    expenses, skipped = parse_expenses_csv(expenses_csv, limit_month=4)
    fixed_costs = parse_fixed_costs_csv(budget_csv, year=budget["year"], limit_month=4)

    writers = Counter(e["created_by_name"] for e in expenses)
    by_month = Counter(e["accounting_month"] for e in expenses)
    pending_count = sum(1 for e in expenses if e["is_pending"])
    fixed_by_account = Counter(e["account_name"] for e in fixed_costs)

    summary = {
        "branch_code": branch_code,
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
        "branch_code": branch_code,
        "budget": budget,
        "expenses": expenses,
        "fixed_costs": fixed_costs,
        "skipped": skipped,
    }

    output_json.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    return output


def main():
    if len(sys.argv) < 4:
        print("사용: python3 parse_branch.py <branch_code> <budget_csv> <expenses_csv>")
        sys.exit(1)
    branch_code = sys.argv[1]
    budget_csv = Path(sys.argv[2])
    expenses_csv = Path(sys.argv[3])
    output_json = expenses_csv.parent / "migration.json"

    out = run(branch_code, budget_csv, expenses_csv, output_json)

    print("=== 파싱 결과 요약 ===")
    for k, v in out["summary"].items():
        print(f"  {k}: {v}")
    print(f"\n출력 파일: {output_json}")
    if out["skipped"]:
        print(f"\n⚠️ 스킵된 {len(out['skipped'])}건:")
        for s in out["skipped"][:10]:
            print(f"  row {s.get('row')}: {s['reason']}")
        if len(out["skipped"]) > 10:
            print(f"  ... 외 {len(out['skipped']) - 10}건")


if __name__ == "__main__":
    main()
