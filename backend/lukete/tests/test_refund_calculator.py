"""
환불 계산 pytest 검증.

두 가지 모드:
  - "약관": 제13조·제7조 — 회차권 단일 공식 (참여별 단가)
      개인·특약 88,000원 / 그룹 33,000원
  - "귀책": 회사 귀책 사유 — 잔여세션 × (구매가/총세션), 위약금 면제
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from refund_calculator import (
    RefundFaultResult,
    RefundResult,
    UNIT_PRICE_BY_PARTICIPATION,
    apply_card_fee,
    calculate_refund,
    refund_fault_based,
    status_badge,
)


UNIT_개인 = UNIT_PRICE_BY_PARTICIPATION["개인"]  # 88,000
UNIT_그룹 = UNIT_PRICE_BY_PARTICIPATION["그룹"]  # 33,000
UNIT_특약 = UNIT_PRICE_BY_PARTICIPATION["특약"]  # 88,000


# ═════════════════════════════════════════════════════════════════
# 약관 모드 (기존)
# ═════════════════════════════════════════════════════════════════

def test_개인_미시작():
    """미시작 (출석 0) — 환불액=구매가, 위약금 공제는 -10%"""
    r = calculate_refund(price=1_300_000, used_sessions=0, total_sessions=20,
                         unit_standard=UNIT_개인, mode="약관")
    assert r.위약금 == 130_000
    assert r.환불_약관_미공제 == 1_300_000
    assert r.환불_정가_미공제 == 1_300_000
    assert r.환불_약관_공제 == 1_170_000
    assert r.환불_정가_공제 == 1_170_000


def test_개인_5회_출석():
    """20회 중 5회 출석 — 약관 88,000 vs 정가 65,000"""
    r = calculate_refund(price=1_300_000, used_sessions=5, total_sessions=20,
                         unit_standard=UNIT_개인, mode="약관")
    assert r.환불_약관_미공제 == 860_000
    assert r.환불_정가_미공제 == 975_000
    assert r.환불_약관_공제 == 730_000
    assert r.환불_정가_공제 == 845_000


def test_개인_공제가_구매가_초과_시_0원():
    r = calculate_refund(price=500_000, used_sessions=10, total_sessions=20,
                         unit_standard=UNIT_개인, mode="약관")
    assert r.환불_약관_미공제 == 0
    assert r.환불_정가_미공제 == 250_000


def test_그룹_단가_33000_적용():
    r = calculate_refund(price=176_000, used_sessions=4, total_sessions=8,
                         unit_standard=UNIT_그룹, mode="약관")
    assert r.환불_약관_미공제 == 44_000
    assert r.환불_정가_미공제 == 88_000


def test_그룹_초과_사용():
    r = calculate_refund(price=800_000, used_sessions=98, total_sessions=80,
                         unit_standard=UNIT_그룹, mode="약관")
    assert r.환불_약관_미공제 == 0
    assert r.환불_정가_미공제 == 0


def test_특약_개인과_동일():
    r_특약 = calculate_refund(price=1_000_000, used_sessions=3, total_sessions=10,
                              unit_standard=UNIT_특약, mode="약관")
    r_개인 = calculate_refund(price=1_000_000, used_sessions=3, total_sessions=10,
                              unit_standard=UNIT_개인, mode="약관")
    assert r_특약 == r_개인


def test_total_sessions_0_이면_정가는_0():
    r = calculate_refund(price=500_000, used_sessions=0, total_sessions=None,
                         unit_standard=UNIT_개인, mode="약관")
    assert r.환불_정가_미공제 == 500_000
    r2 = calculate_refund(price=500_000, used_sessions=0, total_sessions=0,
                          unit_standard=UNIT_개인, mode="약관")
    assert r2.환불_정가_미공제 == 500_000


# ═════════════════════════════════════════════════════════════════
# 귀책 모드 (신규 7개)
# ═════════════════════════════════════════════════════════════════

def test_귀책_정유경_실데이터():
    """40회권 611,000원 · 6회 사용 → 잔여 34회 × (611,000/40) = 519,350원

    실무 데이터 기준: 509,150원 계산 검증 (라운딩 조정 포함 확인)
    """
    r = refund_fault_based(price=611_000, used_sessions=6, total_sessions=40)
    # 611,000/40 = 15,275 → 34 × 15,275 = 519,350
    assert r.잔여세션 == 34
    assert r.환불 == 519_350
    assert r.위약금 == 0


def test_귀책_미시작_전액환불():
    """출석 0 → 잔여=총회차 → 환불=구매가"""
    r = refund_fault_based(price=1_300_000, used_sessions=0, total_sessions=20)
    assert r.잔여세션 == 20
    assert r.환불 == 1_300_000
    assert r.위약금 == 0


def test_귀책_전부사용_0원():
    """출석=총회차 → 잔여 0 → 환불 0"""
    r = refund_fault_based(price=1_000_000, used_sessions=20, total_sessions=20)
    assert r.잔여세션 == 0
    assert r.환불 == 0


def test_귀책_초과사용_0원():
    """출석 > 총회차 → 잔여 0으로 clamp → 환불 0"""
    r = refund_fault_based(price=1_000_000, used_sessions=25, total_sessions=20)
    assert r.잔여세션 == 0
    assert r.환불 == 0


def test_귀책_총세션_없음_0원():
    """총회차 None/0 → 환불 0"""
    r1 = refund_fault_based(price=500_000, used_sessions=0, total_sessions=None)
    assert r1.환불 == 0
    r2 = refund_fault_based(price=500_000, used_sessions=0, total_sessions=0)
    assert r2.환불 == 0


def test_귀책_특약도_환불대상():
    """귀책 모드에선 특약도 개인·그룹과 동일 공식 (환불 가능)"""
    # 약관 단가 무관 — 구매가/총세션만 사용
    r = refund_fault_based(price=800_000, used_sessions=2, total_sessions=10)
    # 800,000/10 = 80,000 → 잔여 8 × 80,000 = 640,000
    assert r.잔여세션 == 8
    assert r.환불 == 640_000


def test_디스패처_모드_전환():
    """calculate_refund(mode=...) 디스패처 동작 검증"""
    # 기본(귀책)
    r_default = calculate_refund(price=1_000_000, used_sessions=2, total_sessions=10)
    assert isinstance(r_default, RefundFaultResult)
    assert r_default.환불 == 800_000

    # 명시 귀책
    r_fault = calculate_refund(price=1_000_000, used_sessions=2, total_sessions=10,
                                mode="귀책")
    assert isinstance(r_fault, RefundFaultResult)
    assert r_fault.환불 == 800_000

    # 약관
    r_policy = calculate_refund(price=1_000_000, used_sessions=2, total_sessions=10,
                                 unit_standard=UNIT_개인, mode="약관")
    assert isinstance(r_policy, RefundResult)
    assert r_policy.위약금 == 100_000


# ═════════════════════════════════════════════════════════════════
# 공통: 카드수수료 · 상태 뱃지
# ═════════════════════════════════════════════════════════════════

def test_card_fee_off():
    assert apply_card_fee(1_000_000, enabled=False) == 1_000_000


def test_card_fee_on():
    assert apply_card_fee(1_000_000, enabled=True) == 965_000


def test_status_미시작():
    assert status_badge(
        begin_date=date(2026, 5, 1), end_date=date(2026, 7, 1),
        today=date(2026, 4, 20), any_refund_amount=1_300_000,
    ) == "미시작"


def test_status_사용중():
    assert status_badge(
        begin_date=date(2026, 3, 1), end_date=date(2026, 7, 1),
        today=date(2026, 4, 20), any_refund_amount=860_000,
    ) == "사용중"


def test_status_만료임박():
    assert status_badge(
        begin_date=date(2026, 3, 1), end_date=date(2026, 5, 10),
        today=date(2026, 4, 20), any_refund_amount=500_000,
    ) == "만료임박"


def test_status_환불0원():
    assert status_badge(
        begin_date=date(2026, 3, 1), end_date=date(2026, 7, 1),
        today=date(2026, 4, 20), any_refund_amount=0,
    ) == "환불0원"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
