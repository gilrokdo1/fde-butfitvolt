"""
erp.butfitvolt.click revenue API 프록시
prefix: /fde-api/jihee/revenue
"""
import os
from datetime import datetime, timezone, timedelta

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

ERP_BASE = "https://erp.butfitvolt.click/api"
ERP_PHONE = os.environ.get("ERP_PHONE", "")
ERP_PASSWORD = os.environ.get("ERP_PASSWORD", "")

_token_cache: dict = {"token": None, "expires_at": None}


def _get_erp_token() -> str:
    now = datetime.now(timezone.utc)
    if _token_cache["token"] and _token_cache["expires_at"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    resp = requests.post(
        f"{ERP_BASE}/auth/login",
        json={"phone_number": ERP_PHONE, "password": ERP_PASSWORD},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="ERP 로그인 실패")

    data = resp.json()
    token = data.get("access_token") or data.get("token") or data.get("data", {}).get("access_token")
    if not token:
        # 응답 구조 확인용
        raise HTTPException(status_code=502, detail=f"ERP 토큰 없음: {list(data.keys())}")

    _token_cache["token"] = token
    _token_cache["expires_at"] = now + timedelta(hours=23)
    return token


from pydantic import Field

class RevenueFilterRequest(BaseModel):
    model_config = {"populate_by_name": True}

    branch: List[str] = Field(default=[], alias="지점명")
    category: List[str] = Field(default=[], alias="카테고리")
    include_refund: bool = Field(default=True, alias="환불_포함")
    search: str = ""
    sort_by: Optional[str] = None
    sort_order: str = "desc"
    date_start: str = Field(alias="결제일_시작")
    date_end: str = Field(alias="결제일_종료")


@router.post("/filter")
def revenue_filter(body: RevenueFilterRequest):
    token = _get_erp_token()
    payload = {
        "지점명": body.branch,
        "카테고리": body.category,
        "환불_포함": body.include_refund,
        "search": body.search,
        "sort_by": body.sort_by,
        "sort_order": body.sort_order,
        "결제일_시작": body.date_start,
        "결제일_종료": body.date_end,
    }
    resp = requests.post(
        f"{ERP_BASE}/revenue/filter",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 401:
        _token_cache["token"] = None
        token = _get_erp_token()
        resp = requests.post(
            f"{ERP_BASE}/revenue/filter",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="ERP API 오류")
    return resp.json()


@router.get("/filter-options")
def revenue_filter_options():
    token = _get_erp_token()
    resp = requests.get(
        f"{ERP_BASE}/revenue/filter-options",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="ERP API 오류")
    return resp.json()
