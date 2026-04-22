"""
루케테80 환불 산정 DB 로더.

- 같은 폴더의 `.env` 에서 DB 접속 정보 로드
- 필라테스 카테고리 전체 회원(개인·그룹·특약) DataFrame 로드
- 환불 계산 + 상태 뱃지 부여 (벡터화)
- @st.cache_data 캐시
"""
from __future__ import annotations

import os
import re
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
import streamlit as st
from dotenv import load_dotenv

from refund_calculator import (
    CARD_FEE_RATE,
    DEFAULT_UNIT_PRICE,
    PENALTY_RATE,
    UNIT_PRICE_BY_PARTICIPATION,
)

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")

# 가산=20, 신도림=16
PLACE_ID_MAP = {"가산": 20, "신도림": 16}
_QUERIES_DIR = _HERE / "queries"


def _connect():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


def _mask_phone(phone: str | None) -> str:
    if not phone:
        return "-"
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11:
        return f"{digits[:3]}-****-{digits[7:]}"
    if len(digits) == 10:
        return f"{digits[:3]}-***-{digits[6:]}"
    return phone


@st.cache_data(ttl=300, show_spinner="DB 조회 중…")
def load_members(place_names: tuple[str, ...]) -> pd.DataFrame:
    place_ids = tuple(PLACE_ID_MAP[p] for p in place_names if p in PLACE_ID_MAP)
    if not place_ids:
        return pd.DataFrame()

    sql = (_QUERIES_DIR / "members.sql").read_text(encoding="utf-8")
    with _connect() as conn:
        members = pd.read_sql(sql, conn, params={"place_ids": place_ids})

    if members.empty:
        return members

    members["phone_masked"] = members["phone"].map(_mask_phone)
    for col in ("pay_date", "begin_date", "end_date"):
        members[col] = pd.to_datetime(members[col]).dt.date
    for col in ("total_sessions", "used_sessions", "remain_sessions", "d_day"):
        members[col] = pd.to_numeric(members[col], errors="coerce")
    return members


def enrich_with_refund(
    df: pd.DataFrame,
    today: date,
    card_fee_on: bool = False,
    mode: str = "귀책",
) -> pd.DataFrame:
    """
    환불 계산 + 상태 뱃지 벡터화.

    mode="약관": refund_std_gross/list_gross/net + penalty (5개)
    mode="귀책": refund_fault + penalty=0 (특약 포함, 잔여세션 × 단가)

    공통 컬럼: status
    """
    if df.empty:
        return df

    out = df.copy()
    price = out["purchase_price"].fillna(0).astype(float)
    used = out["used_sessions"].fillna(0).clip(lower=0).astype(float)
    total = out["total_sessions"].astype("Float64")

    fee = (1 - CARD_FEE_RATE) if card_fee_on else 1.0

    if mode == "귀책":
        # 귀책: 잔여세션 × (구매가 ÷ 총세션). 위약금 면제. 특약도 환불 대상.
        total_f = total.fillna(0).astype(float)
        remain = np.where(total_f > 0, np.maximum(0, total_f - used), 0.0)
        per_session = np.where(total_f > 0, price / np.where(total_f > 0, total_f, 1), 0.0)
        refund_fault = np.maximum(0, remain * per_session).round().astype(int)

        out["penalty"] = 0
        out["refund_fault"] = (refund_fault * fee).round().astype(int)
        out["refund_std_gross"] = out["refund_fault"]
        out["refund_list_gross"] = out["refund_fault"]
        out["refund_std_net"] = out["refund_fault"]
        out["refund_list_net"] = out["refund_fault"]
        any_refund = out["refund_fault"]
    else:
        # 약관: 기존 로직
        unit_std = out["participation"].map(UNIT_PRICE_BY_PARTICIPATION).fillna(DEFAULT_UNIT_PRICE).astype(float)
        unit_list = np.where(total.notna() & (total > 0), price / total.fillna(1), 0.0)

        penalty = (price * PENALTY_RATE).round().astype(int)
        refund_std = np.maximum(0, (price - used * unit_std)).round().astype(int)
        refund_list = np.maximum(0, (price - used * unit_list)).round().astype(int)
        refund_std_net = np.maximum(0, refund_std - penalty).astype(int)
        refund_list_net = np.maximum(0, refund_list - penalty).astype(int)

        out["penalty"] = penalty
        out["refund_std_gross"] = (refund_std * fee).round().astype(int)
        out["refund_list_gross"] = (refund_list * fee).round().astype(int)
        out["refund_std_net"] = (refund_std_net * fee).round().astype(int)
        out["refund_list_net"] = (refund_list_net * fee).round().astype(int)
        out["refund_fault"] = 0
        any_refund = out[["refund_std_gross", "refund_list_gross", "refund_std_net", "refund_list_net"]].max(axis=1)

    begin = pd.to_datetime(out["begin_date"])
    end = pd.to_datetime(out["end_date"])
    today_ts = pd.Timestamp(today)
    days_left = (end - today_ts).dt.days

    out["status"] = np.select(
        [
            any_refund <= 0,
            end < today_ts,
            begin > today_ts,
            days_left <= 30,
        ],
        ["환불0원", "만료", "미시작", "만료임박"],
        default="사용중",
    )
    return out
