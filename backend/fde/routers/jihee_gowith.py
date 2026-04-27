"""
고위드 API 프록시
prefix: /fde-api/jihee/gowith
"""
import os
import urllib.request
import urllib.parse
import json
from calendar import monthrange

from fastapi import APIRouter, HTTPException, Query

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


@router.get("/expenses")
def get_expenses(yearMonth: str = Query(..., description="YYYYMM 형식")):
    """
    고위드 지출내역 조회 (전체 페이지 수집)
    yearMonth: '202601' 형식
    """
    if len(yearMonth) != 6 or not yearMonth.isdigit():
        raise HTTPException(status_code=400, detail="yearMonth는 YYYYMM 형식이어야 합니다")

    year = int(yearMonth[:4])
    month = int(yearMonth[4:])
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

    return {
        "yearMonth": yearMonth,
        "totalCount": len(all_content),
        "expenses": all_content,
    }
