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
ERP_PHONE = os.environ.get("ERP_PHONE", "01095976245")
ERP_PASSWORD = os.environ.get("ERP_PASSWORD", "778599wl!!")

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


class RevenueFilterRequest(BaseModel):
    지점명: List[str] = []
    카테고리: List[str] = []
    환불_포함: bool = True
    search: str = ""
    sort_by: Optional[str] = None
    sort_order: str = "desc"
    결제일_시작: str
    결제일_종료: str


@router.post("/filter")
def revenue_filter(body: RevenueFilterRequest):
    token = _get_erp_token()
    resp = requests.post(
        f"{ERP_BASE}/revenue/filter",
        json=body.model_dump(by_alias=False),
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 401:
        # 토큰 만료 시 강제 갱신
        _token_cache["token"] = None
        token = _get_erp_token()
        resp = requests.post(
            f"{ERP_BASE}/revenue/filter",
            json=body.model_dump(by_alias=False),
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
