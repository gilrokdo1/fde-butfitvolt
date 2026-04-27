"""
고위드 API 프록시 + DB 저장
prefix: /fde-api/jihee/gowith
"""
import os
import urllib.request
import urllib.parse
import json
from calendar import monthrange

from fastapi import APIRouter, HTTPException, Query
from utils.db import _get_conn

router = APIRouter()

GOWID_BASE = "https://openapi.gowid.com/v1"
PAGE_SIZE = 1000


def _gowid_get(path: str, params: dict) -> dict:
    api_key = os.environ.get("GOWID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="GOWID_API_KEY 환경변수가 설정되지 않았습니다")
    qs = urllib.parse.urlencode(params)
    url = f"{GOWID_BASE}{path}?{qs}"
    req = urllib.request.Request(url, headers={"Authorization": api_key})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=f"고위드 API 오류: {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"고위드 API 연결 실패: {e}")


def _fetch_all_expenses(year_month: str) -> list:
    """고위드 API에서 해당 월 전체 지출내역 수집"""
    year = int(year_month[:4])
    month = int(year_month[4:])
    _, last_day = monthrange(year, month)
    start_date = f"{year}-{month:02d}-01"
    end_date = f"{year}-{month:02d}-{last_day:02d}"

    all_content = []
    page = 0
    while True:
        data = _gowid_get("/expenses", {
            "startDate": start_date,
            "endDate": end_date,
            "size": PAGE_SIZE,
            "page": page,
        })
        content = data.get("data", {}).get("content", [])
        all_content.extend(content)
        total_pages = data.get("data", {}).get("totalPages", 1)
        page += 1
        if page >= total_pages:
            break

    return all_content


@router.post("/sync")
def sync_expenses(yearMonth: str = Query(..., description="YYYYMM 형식")):
    """
    고위드 API에서 해당 월 지출내역을 조회하여 DB에 upsert.
    expense_id 기준으로 중복 방지.
    """
    if len(yearMonth) != 6 or not yearMonth.isdigit():
        raise HTTPException(status_code=400, detail="yearMonth는 YYYYMM 형식이어야 합니다")

    expenses = _fetch_all_expenses(yearMonth)

    conn = _get_conn("fde")
    try:
        with conn.cursor() as cur:
            upserted = 0
            for e in expenses:
                purpose = e.get("purpose") or {}
                cur.execute("""
                    INSERT INTO jihee_gowith_expenses (
                        expense_id, year_month, expense_date, expense_time,
                        krw_amount, currency, approved_amount, approval_status,
                        purpose_name, card_alias, card_user_name, short_card_number,
                        store_name, store_address, memo, synced_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                    ON CONFLICT (expense_id) DO UPDATE SET
                        year_month        = EXCLUDED.year_month,
                        expense_date      = EXCLUDED.expense_date,
                        expense_time      = EXCLUDED.expense_time,
                        krw_amount        = EXCLUDED.krw_amount,
                        currency          = EXCLUDED.currency,
                        approved_amount   = EXCLUDED.approved_amount,
                        approval_status   = EXCLUDED.approval_status,
                        purpose_name      = EXCLUDED.purpose_name,
                        card_alias        = EXCLUDED.card_alias,
                        card_user_name    = EXCLUDED.card_user_name,
                        short_card_number = EXCLUDED.short_card_number,
                        store_name        = EXCLUDED.store_name,
                        store_address     = EXCLUDED.store_address,
                        memo              = EXCLUDED.memo,
                        synced_at         = NOW()
                """, (
                    e.get("expenseId"),
                    yearMonth,
                    e.get("expenseDate"),
                    e.get("expenseTime"),
                    e.get("krwAmount"),
                    e.get("currency"),
                    e.get("approvedAmount"),
                    e.get("approvalStatus"),
                    purpose.get("name"),
                    e.get("cardAlias"),
                    e.get("cardUserName"),
                    e.get("shortCardNumber"),
                    e.get("storeName"),
                    e.get("storeAddress"),
                    e.get("memo"),
                ))
                upserted += 1
        conn.commit()
    finally:
        conn.close()

    return {"yearMonth": yearMonth, "upserted": upserted}


@router.get("/expenses")
def get_expenses(yearMonth: str = Query(..., description="YYYYMM 형식")):
    """
    DB에서 해당 월 지출내역 조회.
    DB에 데이터가 없으면 고위드 API를 직접 호출해 반환 (저장은 하지 않음).
    """
    if len(yearMonth) != 6 or not yearMonth.isdigit():
        raise HTTPException(status_code=400, detail="yearMonth는 YYYYMM 형식이어야 합니다")

    conn = _get_conn("fde")
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT expense_id, year_month, expense_date, expense_time,
                       krw_amount, currency, approved_amount, approval_status,
                       purpose_name, card_alias, card_user_name, short_card_number,
                       store_name, store_address, memo, journal_date, synced_at
                FROM jihee_gowith_expenses
                WHERE year_month = %s
                ORDER BY expense_date DESC, expense_time DESC
            """, (yearMonth,))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
    finally:
        conn.close()

    expenses = []
    for row in rows:
        r = dict(zip(cols, row))
        expenses.append({
            "expenseId": r["expense_id"],
            "expenseDate": r["expense_date"],
            "expenseTime": r["expense_time"],
            "krwAmount": r["krw_amount"],
            "currency": r["currency"],
            "approvedAmount": r["approved_amount"],
            "approvalStatus": r["approval_status"],
            "purpose": {"name": r["purpose_name"]} if r["purpose_name"] else None,
            "cardAlias": r["card_alias"],
            "cardUserName": r["card_user_name"],
            "shortCardNumber": r["short_card_number"],
            "storeName": r["store_name"],
            "storeAddress": r["store_address"],
            "memo": r["memo"],
            "journalDate": r["journal_date"].isoformat() if r["journal_date"] else None,
            "syncedAt": r["synced_at"].isoformat() if r["synced_at"] else None,
        })

    return {
        "yearMonth": yearMonth,
        "totalCount": len(expenses),
        "expenses": expenses,
        "fromDb": True,
    }
