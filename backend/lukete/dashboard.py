"""
루케테80 환불 산정 대시보드 (Streamlit).

두 가지 환불 기준:
  - 위약금 제외 (기본): 잔여세션 × (구매가 ÷ 총세션), 위약금 면제, 특약 포함
  - 약관: 제13조·제7조, 위약금 10% 공제, 특약 제외
"""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import pandas as pd
import streamlit as st

from data_loader import PLACE_ID_MAP, enrich_with_refund, load_members

_HERE = Path(__file__).resolve().parent

st.set_page_config(
    page_title="루케테80 환불 산정",
    layout="wide",
    initial_sidebar_state="collapsed",
)

today = date.today()

st.title("루케테80 환불 산정 시뮬레이션")
st.caption(
    f"기준일 {today:%Y-%m-%d} · 실시간 회원·결제 데이터 · "
    "근거 약관 제13조(회차권) · 제7조.3(그룹 단가) · 제7조.4(카드수수료) · 내부 실무자용"
)

# ── 필터 ──
with st.container(border=True):
    c1, c2, c3, c4 = st.columns([1.2, 1.8, 1.4, 1.2])
    with c1:
        selected_places = st.multiselect(
            "지점",
            options=list(PLACE_ID_MAP.keys()),
            default=["가산"],
        )
    with c2:
        selected_participation = st.multiselect(
            "참여 형태",
            options=["개인", "그룹", "특약"],
            default=["개인", "그룹", "특약"],
            help="개인·특약 단가 88,000원 · 그룹 단가 33,000원 (약관 모드)",
        )
    with c3:
        refund_mode = st.radio(
            "환불 기준",
            options=["위약금 제외", "약관"],
            index=0,
            horizontal=True,
            help="위약금 제외: 잔여세션 비례 환불 · 위약금 면제\n약관: 제13조·제7조 — 위약금 10% 공제",
        )
    with c4:
        card_fee_on = st.checkbox(
            "카드수수료 3.5% 공제",
            value=False,
            help="약관 제7조.4 — 토글 ON 시 환불액 × 0.965",
        )

if not selected_places:
    st.info("지점을 선택하세요.")
    st.stop()

members = load_members(tuple(selected_places))
if members.empty:
    st.warning("조회된 회원이 없습니다.")
    st.stop()

if selected_participation:
    members = members[members["participation"].isin(selected_participation)]

enriched = enrich_with_refund(
    members, today=today, card_fee_on=card_fee_on, mode=refund_mode
).reset_index(drop=True)

if enriched.empty:
    st.warning("필터 조건에 맞는 회원이 없습니다.")
    st.stop()

is_fault = refund_mode == "위약금 제외"

# ── KPI (4개) ──
total_members = len(enriched)
individual_cnt = int((enriched["participation"] == "개인").sum())
group_cnt = int((enriched["participation"] == "그룹").sum())
special_cnt = int((enriched["participation"] == "특약").sum())
total_purchase = int(enriched["purchase_price"].fillna(0).sum())
total_remain = int(enriched["remain_sessions"].fillna(0).sum())
total_penalty = int(enriched["penalty"].sum())
total_fault = int(enriched["refund_fault"].sum()) if is_fault else 0

k1, k2, k3, k4 = st.columns(4)
k1.metric(
    "대상 회원 수",
    f"{total_members:,}명",
    delta=f"개인 {individual_cnt} · 그룹 {group_cnt} · 특약 {special_cnt}",
    delta_color="off",
)
k2.metric("총 구매 금액", f"{total_purchase:,}원")
k3.metric("잔여 세션 합계", f"{total_remain:,}회", help="admin 기준 FLOOR(remain_credit/100) 합계")

if is_fault:
    k4.metric(
        "환불 예상 합계 (위약금 제외)",
        f"{total_fault:,}원",
        help="잔여세션 × (구매가 ÷ 총세션), 위약금 면제",
    )
else:
    k4.metric("위약금 합계", f"{total_penalty:,}원", help="각 회원 구매가 × 10% 합계")


card_fee_note = "카드수수료 적용 기준" if card_fee_on else "카드수수료 미적용 기준"

# ── 매트릭스 (약관 모드 전용 시나리오 비교) ──
if not is_fault:
    std_gross_sum = int(enriched["refund_std_gross"].sum())
    list_gross_sum = int(enriched["refund_list_gross"].sum())
    std_net_sum = int(enriched["refund_std_net"].sum())
    list_net_sum = int(enriched["refund_list_net"].sum())

    matrix_df = pd.DataFrame(
        [
            ["위약금 미공제", std_gross_sum, list_gross_sum],
            ["위약금 공제", std_net_sum, list_net_sum],
            ["차이 (위약금 효과)", std_net_sum - std_gross_sum, list_net_sum - list_gross_sum],
        ],
        columns=["구분", "약관 기준", "정가 기준"],
    )
    st.markdown(f"**환불 합계 시나리오 비교 (약관 모드)** · 회원 {total_members}명 합산 · {card_fee_note}")
    st.dataframe(
        matrix_df,
        column_config={
            "구분": st.column_config.TextColumn(width="medium"),
            "약관 기준": st.column_config.NumberColumn(format="%,d원"),
            "정가 기준": st.column_config.NumberColumn(format="%,d원"),
        },
        hide_index=True,
        width="stretch",
    )


# ── 탭 ──
tab_members, tab_summary, tab_terms = st.tabs(["전체 회원", "요약", "약관 참조"])


with tab_members:
    zero_cnt = int((enriched["status"] == "환불0원").sum())
    start_cnt = int((enriched["status"] == "미시작").sum())
    expiring_cnt = int((enriched["status"] == "만료임박").sum())
    memo_flag_series = enriched.get("ops_memo_cnt", pd.Series([0]*len(enriched))).fillna(0) > 0
    overflow_series = (
        enriched["remain_sessions"].fillna(0).astype(float)
        > enriched["total_sessions"].fillna(0).astype(float)
    ) & (enriched["total_sessions"].fillna(0).astype(float) > 0)
    ops_cnt = int((memo_flag_series | overflow_series).sum())
    st.caption(
        f"{total_members}명 · 환불0원 {zero_cnt} · 미시작 {start_cnt} · 만료임박(≤30일) {expiring_cnt} · ⚠ 운영이슈 {ops_cnt}"
    )

    status_emoji = {
        "사용중": "🟢 사용중",
        "만료임박": "⏳ 만료임박",
        "미시작": "⏸ 미시작",
        "환불0원": "🔴 환불0원",
        "만료": "◻ 만료",
    }

    display = enriched.copy()
    display["상태"] = display["status"].map(lambda s: status_emoji.get(s, s))

    # 잔여 > 총회차 자동 검출 (이전 상품 잔여 수기 이관 의심)
    overflow_mask = (
        display["remain_sessions"].fillna(0).astype(float)
        > display["total_sessions"].fillna(0).astype(float)
    ) & (display["total_sessions"].fillna(0).astype(float) > 0)

    overflow_note = "⚠ 잔여>총회차 (이전 상품 회차 수기 이관 추정)"
    if "ops_memo_preview" in display.columns:
        display["ops_memo_preview"] = display["ops_memo_preview"].fillna("").astype(str)
        display.loc[overflow_mask, "ops_memo_preview"] = (
            overflow_note + " ‖ " + display.loc[overflow_mask, "ops_memo_preview"]
        ).str.rstrip(" ‖ ")
    if "ops_memo_cnt" in display.columns:
        memo_flag = display["ops_memo_cnt"].fillna(0).astype(int) > 0
        display["⚠"] = (memo_flag | overflow_mask).map(lambda b: "⚠" if b else "")
    display = display.rename(columns={
        "place_name": "지점",
        "user_name": "회원명",
        "phone_masked": "연락처",
        "participation": "참여",
        "product_name": "상품명",
        "purchase_price": "구매가",
        "pay_date": "결제일",
        "begin_date": "시작일",
        "end_date": "종료일",
        "d_day": "잔여 일 수",
        "total_sessions": "총 회차",
        "used_sessions": "출석",
        "remain_sessions": "잔여 회차",
        "reserved_sessions": "예약출석",
        "ops_memo_preview": "운영메모",
        "recent_5_sessions": "최근수업5건",
        "penalty": "위약금",
        "refund_std_gross": "환불_약관_미공제",
        "refund_list_gross": "환불_정가_미공제",
        "refund_std_net": "환불_약관_공제",
        "refund_list_net": "환불_정가_공제",
        "refund_fault": "환불 금액",
    })

    if is_fault:
        cols = [
            "상태", "⚠", "지점", "회원명", "연락처", "참여", "상품명",
            "구매가", "총 회차", "출석", "잔여 회차", "환불 금액",
            "결제일", "시작일", "종료일", "잔여 일 수", "최근수업5건", "운영메모",
        ]
    else:
        cols = [
            "상태", "⚠", "지점", "회원명", "연락처", "참여", "상품명",
            "구매가", "총 회차", "출석", "잔여 회차", "위약금",
            "환불_약관_미공제", "환불_정가_미공제",
            "환불_약관_공제", "환불_정가_공제",
            "결제일", "시작일", "종료일", "잔여 일 수", "최근수업5건", "운영메모",
        ]
    cols = [c for c in cols if c in display.columns]
    display = display[cols]

    won = st.column_config.NumberColumn(format="%,d원")
    col_cfg = {
        "구매가": won,
        "⚠": st.column_config.TextColumn(width="small", help="운영 이슈 메모 있음 (100회→80회 등록 오류 등)"),
        "총 회차": st.column_config.NumberColumn(format="%,d"),
        "출석": st.column_config.NumberColumn(format="%,d", help="admin 크레딧 기준 (default−remain)/100"),
        "잔여 회차": st.column_config.NumberColumn(format="%,d", help="admin remain_credit/100 (공식 잔여)"),
        "운영메모": st.column_config.TextColumn(width="large", help="변경진행·서비스·연장 등 운영 보정 흔적 + 잔여>총회차 자동 검출"),
        "잔여 일 수": st.column_config.NumberColumn(format="%,d일"),
    }
    if is_fault:
        col_cfg["환불 금액"] = won
    else:
        col_cfg.update({
            "위약금": won,
            "환불_약관_미공제": won, "환불_정가_미공제": won,
            "환불_약관_공제": won, "환불_정가_공제": won,
        })

    st.dataframe(
        display,
        column_config=col_cfg,
        hide_index=True,
        width="stretch",
        height=560,
    )

    mode_tag = "위약금제외" if is_fault else "약관"
    st.download_button(
        "CSV 다운로드",
        display.to_csv(index=False, encoding="utf-8-sig"),
        f"루케테80_환불산정_{mode_tag}_{datetime.now():%Y%m%d_%H%M}.csv",
        "text/csv",
        key="refund_csv",
    )

    # 계산 근거 (모드별 분기)
    with st.expander("계산 근거"):
        if is_fault:
            st.markdown(
                """
**위약금 제외 기준** — 위약금 면제 · 잔여세션 비례 환불

- **총 회차**: `FLOOR(default_credit / 100)`
- **잔여 회차**: `FLOOR(remain_credit / 100)` — **admin 크레딧이 공식 잔여 (체크인 자동 차감 + 운영자 보정 포함)**
- **출석**: `총 회차 − 잔여 회차` (admin 크레딧 기준)
- **예약출석(참고)**: `b_class_bsessionreservation` 중 `is_canceled=FALSE` & `수업일 ≤ 오늘` 건수 — admin과 차이 나면 운영 보정 흔적
- **환불 금액**: `잔여 회차 × (구매가 ÷ 총 회차)`
- **위약금**: 0원 (면제)
- **적용 범위**: 개인·그룹·**특약 포함** 동일 공식
- **카드수수료 공제**: 토글 ON 시 × 0.965 (제7조.4)
"""
            )
        else:
            st.markdown(
                """
**약관 환불 기준** — 제13조(개인·특약 회차권) · 제7조(그룹 기간권)

- **구매가**: 회원이 결제한 금액
- **총 회차**: `FLOOR(default_credit / 100)`
- **잔여 회차**: `FLOOR(remain_credit / 100)` — admin 크레딧 기준
- **출석**: `총 회차 − 잔여 회차` (admin 크레딧 기준)
- **예약출석(참고)**: `b_class_bsessionreservation` 중 `is_canceled=FALSE` & `수업일 ≤ 오늘` 건수
- **위약금**: 구매가의 10%
- **환불(약관 기준)**: 구매가 − 출석 × **단가** (개인·특약 88,000 / 그룹 33,000)
- **환불(정가 기준)**: 구매가 − 출석 × (구매가 ÷ 총 회차)
- **환불(위약금 공제)**: 위 값 − 위약금 (0으로 clamp)
- **특약**: 약관상 환불 불가 (표시만)
- **카드수수료 공제**: 토글 ON 시 × 0.965 (제7조.4)
"""
            )


with tab_summary:
    st.markdown("#### 참여 형태별 합계")
    if is_fault:
        agg = enriched.groupby("participation", as_index=False).agg(
            회원수=("user_name", "count"),
            구매가합=("purchase_price", "sum"),
            잔여세션합=("remain_sessions", "sum"),
            환불예상합=("refund_fault", "sum"),
        )
    else:
        agg = enriched.groupby("participation", as_index=False).agg(
            회원수=("user_name", "count"),
            구매가합=("purchase_price", "sum"),
            위약금합=("penalty", "sum"),
            환불_약관_미공제=("refund_std_gross", "sum"),
            환불_정가_미공제=("refund_list_gross", "sum"),
            환불_약관_공제=("refund_std_net", "sum"),
            환불_정가_공제=("refund_list_net", "sum"),
        )
    st.dataframe(agg, hide_index=True, width="stretch")

    st.markdown("#### 지점별 합계")
    if is_fault:
        by_place = enriched.groupby("place_name", as_index=False).agg(
            회원수=("user_name", "count"),
            구매가합=("purchase_price", "sum"),
            잔여세션합=("remain_sessions", "sum"),
            환불예상합=("refund_fault", "sum"),
        )
    else:
        by_place = enriched.groupby("place_name", as_index=False).agg(
            회원수=("user_name", "count"),
            구매가합=("purchase_price", "sum"),
            위약금합=("penalty", "sum"),
            환불_약관_공제=("refund_std_net", "sum"),
            환불_정가_공제=("refund_list_net", "sum"),
        )
    st.dataframe(by_place, hide_index=True, width="stretch")


@st.cache_data
def _load_terms() -> str:
    path = _HERE / "assets" / "terms.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


with tab_terms:
    text = _load_terms()
    if text:
        st.markdown(text)
    else:
        st.warning("약관 원문 파일을 찾을 수 없습니다: assets/terms.md")


# ── 푸터 주석 ──
if is_fault:
    st.caption(
        "⚠ 위약금 제외 모드는 위약금을 면제하고 잔여 세션 비례로 환불하는 시뮬레이션입니다. "
        "특약 회원도 잔여 세션 비례 환불 대상으로 포함됩니다."
    )
else:
    st.caption(
        "⚠ 약관 모드는 일반 회원 중도해지 시 적용 공식입니다. "
        "특약 상품은 유의사항상 환불 불가이며, 참고치로만 표시됩니다."
    )
