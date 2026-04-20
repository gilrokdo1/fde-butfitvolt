"""
루케테80 환불 계산.

두 가지 모드:
  - "약관": 제13조(개인/특약 단가 88,000) · 제7조(그룹 단가 33,000) 기반
            위약금 10% 공제. 특약은 환불 불가.
  - "귀책": 회사 귀책으로 서비스 제공 불가 시 잔여 세션 비례 환불.
            환불 = 잔여세션 × (구매가 ÷ 총세션).
            위약금 면제. 개인·그룹·특약 동일 공식.

카드수수료 옵션 (제7조.4): 토글 ON 시 환불 금액 × 0.965.

모든 함수는 순수 함수. DB/UI 의존 없음.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal


PENALTY_RATE = 0.10
CARD_FEE_RATE = 0.035

UNIT_PRICE_BY_PARTICIPATION: dict[str, int] = {
    "개인": 88_000,
    "그룹": 33_000,
    "특약": 88_000,
}
DEFAULT_UNIT_PRICE = 88_000

RefundMode = Literal["약관", "귀책"]


@dataclass
class RefundResult:
    """약관 모드 결과 (5개 금액)."""
    위약금: int
    환불_약관_미공제: int
    환불_정가_미공제: int
    환불_약관_공제: int
    환불_정가_공제: int


@dataclass
class RefundFaultResult:
    """귀책 모드 결과."""
    잔여세션: int
    환불: int
    위약금: int  # 항상 0


def refund_fault_based(
    price: float,
    used_sessions: int,
    total_sessions: int | None,
) -> RefundFaultResult:
    """귀책 환불: 잔여세션 × (구매가 ÷ 총세션). 위약금 면제."""
    if not total_sessions or total_sessions <= 0:
        return RefundFaultResult(잔여세션=0, 환불=0, 위약금=0)
    remain = max(0, total_sessions - used_sessions)
    per_session = price / total_sessions
    amount = int(round(remain * per_session))
    return RefundFaultResult(잔여세션=remain, 환불=max(0, amount), 위약금=0)


def _refund_policy(
    price: float,
    used_sessions: int,
    total_sessions: int | None,
    unit_standard: float = DEFAULT_UNIT_PRICE,
) -> RefundResult:
    """약관 기준 회차권 환불 (기존 로직)."""
    penalty = int(round(price * PENALTY_RATE))
    unit_list = price / total_sessions if total_sessions else 0

    refund_std = max(0, int(round(price - used_sessions * unit_standard)))
    refund_list = max(0, int(round(price - used_sessions * unit_list)))

    return RefundResult(
        위약금=penalty,
        환불_약관_미공제=refund_std,
        환불_정가_미공제=refund_list,
        환불_약관_공제=max(0, refund_std - penalty),
        환불_정가_공제=max(0, refund_list - penalty),
    )


def calculate_refund(
    price: float,
    used_sessions: int,
    total_sessions: int | None,
    unit_standard: float = DEFAULT_UNIT_PRICE,
    mode: RefundMode = "귀책",
) -> RefundResult | RefundFaultResult:
    """모드 디스패처. 기본은 '귀책'."""
    if mode == "귀책":
        return refund_fault_based(price, used_sessions, total_sessions)
    return _refund_policy(price, used_sessions, total_sessions, unit_standard)


def apply_card_fee(amount: float, enabled: bool = False) -> int:
    if not enabled:
        return int(round(amount))
    return int(round(amount * (1 - CARD_FEE_RATE)))


def status_badge(
    begin_date: date,
    end_date: date,
    today: date,
    any_refund_amount: int,
    near_expiry_days: int = 30,
) -> Literal["미시작", "사용중", "만료임박", "환불0원", "만료"]:
    if any_refund_amount <= 0:
        return "환불0원"
    if end_date < today:
        return "만료"
    if begin_date > today:
        return "미시작"
    days_left = (end_date - today).days
    if days_left <= near_expiry_days:
        return "만료임박"
    return "사용중"
