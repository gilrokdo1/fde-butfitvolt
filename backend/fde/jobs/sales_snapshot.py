"""
실적분석 스냅샷 크론잡 — 매일 새벽 4시 실행.
replica DB에서 데이터 집계 → FDE DB 스냅샷 테이블에 UPSERT.
실행: python -m jobs.sales_snapshot [--month 2026-04] [--date 2026-04-13]
"""
import argparse
import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import safe_db
from utils.sales_queries import (
    fetch_branch_revenue,
    fetch_ft_new,
    fetch_ft_rereg,
    fetch_pt_conversion,
    fetch_pt_trial,
    fetch_subscription_churn,
    fetch_targets,
)


def run_snapshot(target_month: str = None, snapshot_date_str: str = None):
    yesterday = date.today() - timedelta(days=1)
    if not snapshot_date_str:
        snapshot_date_str = yesterday.isoformat()
    if not target_month:
        target_month = yesterday.strftime("%Y-%m")

    sd = date.fromisoformat(snapshot_date_str)
    start_date = target_month + "-01"
    end_date = snapshot_date_str
    year, month = int(target_month[:4]), int(target_month[5:7])

    print(f"[sales_snapshot] 시작: target_month={target_month}, end_date={end_date}")

    # 1. replica DB에서 데이터 수집
    print("[1/6] 매출 데이터 수집...")
    with safe_db("replica") as (conn, cur):
        revenue_data = fetch_branch_revenue(cur, start_date, end_date)
    print(f"  → {len(revenue_data)}개 지점")

    print("[2/6] FT 신규 데이터 수집...")
    with safe_db("replica") as (conn, cur):
        ft_new_data = fetch_ft_new(cur, start_date, end_date)
    print(f"  → {len(ft_new_data)}개 지점")

    print("[3/6] PT 체험권 + 전환율 수집...")
    with safe_db("replica") as (conn, cur):
        pt_trial_data = fetch_pt_trial(cur, start_date, end_date)
        pt_conv_data = fetch_pt_conversion(cur, start_date, end_date)
    print(f"  → 체험 {len(pt_trial_data)}개, 전환 {len(pt_conv_data)}개 지점")

    print("[4/6] 재등록률 수집...")
    with safe_db("replica") as (conn, cur):
        rereg_data = fetch_ft_rereg(cur, target_month, end_date)
    print(f"  → {len(rereg_data)}개 지점")

    print("[5/6] 구독이탈 수집...")
    with safe_db("replica") as (conn, cur):
        sub_data = fetch_subscription_churn(cur, start_date, end_date)
    print(f"  → {len(sub_data)}개 지점")

    print("[6/6] 목표 데이터 수집...")
    try:
        with safe_db("replica") as (conn, cur):
            targets = fetch_targets(cur, year, month)
        print(f"  → {len(targets)}개 지점")
    except Exception as e:
        print(f"  → 목표 데이터 수집 실패 (계속 진행): {e}")
        targets = {}

    # 2. sanity check
    total_ft = sum(d["ft_mbs"] + d["ft_option"] + d["ft_daily"] + d["ft_refund"] for d in revenue_data.values())
    total_pt = sum(d["pt_mbs"] + d["pt_refund"] + d["pt_ansim"] for d in revenue_data.values())
    total_bs1 = sum(d["bs1_count"] for d in ft_new_data.values())
    print(f"\n[sanity check]")
    print(f"  FT 매출: {total_ft:,}만 / PT 매출: {total_pt:,}만")
    print(f"  BS 1회차: {total_bs1}명")
    if total_ft + total_pt == 0:
        print("  ⚠ 매출 합계가 0 — 데이터 확인 필요")

    # 3. FDE DB에 UPSERT
    print("\n[저장] FDE DB에 스냅샷 저장 중...")

    with safe_db("fde") as (conn, cur):
        # 매출
        for branch, d in revenue_data.items():
            t = targets.get(branch, {})
            cur.execute("""
                INSERT INTO dongha_sales_snapshot
                    (snapshot_date, target_month, branch, ft_mbs, ft_option, ft_daily, ft_refund,
                     pt_mbs, pt_refund, pt_ansim, ft_target, pt_target)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (snapshot_date, target_month, branch) DO UPDATE SET
                    ft_mbs=EXCLUDED.ft_mbs, ft_option=EXCLUDED.ft_option,
                    ft_daily=EXCLUDED.ft_daily, ft_refund=EXCLUDED.ft_refund,
                    pt_mbs=EXCLUDED.pt_mbs, pt_refund=EXCLUDED.pt_refund,
                    pt_ansim=EXCLUDED.pt_ansim, ft_target=EXCLUDED.ft_target,
                    pt_target=EXCLUDED.pt_target, created_at=NOW()
            """, (
                snapshot_date_str, target_month, branch,
                d["ft_mbs"], d["ft_option"], d["ft_daily"], d["ft_refund"],
                d["pt_mbs"], d["pt_refund"], d["pt_ansim"],
                t.get("FT_매출_전체_금액", 0), t.get("PT_매출_전체_금액", 0),
            ))

        # FT 신규
        for branch, d in ft_new_data.items():
            t = targets.get(branch, {})
            cur.execute("""
                INSERT INTO dongha_ft_new_snapshot
                    (snapshot_date, target_month, branch, bs1_count, bs1_revenue,
                     prev_month_same_period, prev_year_same_period,
                     prev_month_full, prev_year_full, target_count, target_revenue)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (snapshot_date, target_month, branch) DO UPDATE SET
                    bs1_count=EXCLUDED.bs1_count, bs1_revenue=EXCLUDED.bs1_revenue,
                    prev_month_same_period=EXCLUDED.prev_month_same_period,
                    prev_year_same_period=EXCLUDED.prev_year_same_period,
                    prev_month_full=EXCLUDED.prev_month_full,
                    prev_year_full=EXCLUDED.prev_year_full,
                    target_count=EXCLUDED.target_count, target_revenue=EXCLUDED.target_revenue,
                    created_at=NOW()
            """, (
                snapshot_date_str, target_month, branch,
                d["bs1_count"], d["bs1_revenue"],
                d["prev_month_same_period"], d["prev_year_same_period"],
                d["prev_month_full"], d["prev_year_full"],
                t.get("FT_BS1회차_결제자_명수", 0), t.get("FT_BS1회차_매출_금액", 0),
            ))

        # PT 체험/전환
        for branch in set(list(pt_trial_data.keys()) + list(pt_conv_data.keys())):
            td = pt_trial_data.get(branch, {})
            cd = pt_conv_data.get(branch, {})
            t = targets.get(branch, {})
            cur.execute("""
                INSERT INTO dongha_pt_trial_snapshot
                    (snapshot_date, target_month, branch, trial_count, trial_revenue,
                     solo_count, combo_count, conversion_target, conversion_count,
                     conversion_revenue, target_trial, target_conversion)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (snapshot_date, target_month, branch) DO UPDATE SET
                    trial_count=EXCLUDED.trial_count, trial_revenue=EXCLUDED.trial_revenue,
                    solo_count=EXCLUDED.solo_count, combo_count=EXCLUDED.combo_count,
                    conversion_target=EXCLUDED.conversion_target,
                    conversion_count=EXCLUDED.conversion_count,
                    conversion_revenue=EXCLUDED.conversion_revenue,
                    target_trial=EXCLUDED.target_trial,
                    target_conversion=EXCLUDED.target_conversion, created_at=NOW()
            """, (
                snapshot_date_str, target_month, branch,
                td.get("trial_count", 0), td.get("trial_revenue", 0),
                td.get("solo_count", 0), td.get("combo_count", 0),
                cd.get("conversion_target", 0), cd.get("conversion_count", 0),
                0,  # conversion_revenue — 별도 쿼리 필요 시 추가
                t.get("PT_체험권_결제자_명수", 0), t.get("PT_체험전환_결제자_명수", 0),
            ))

        # 재등록률
        for branch, d in rereg_data.items():
            cur.execute("""
                INSERT INTO dongha_rereg_snapshot
                    (snapshot_date, target_month, branch, category, period_type,
                     target_count, pre_paid_count, paid_count, rereg_rate, target_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (snapshot_date, target_month, branch, category, period_type) DO UPDATE SET
                    target_count=EXCLUDED.target_count, pre_paid_count=EXCLUDED.pre_paid_count,
                    paid_count=EXCLUDED.paid_count, rereg_rate=EXCLUDED.rereg_rate,
                    target_rate=EXCLUDED.target_rate, created_at=NOW()
            """, (
                snapshot_date_str, target_month, branch, "FT", "당대당",
                d["target_count"], d["pre_paid_count"], d["paid_count"],
                d["rereg_rate"], 0,
            ))

        # 구독이탈
        for branch, d in sub_data.items():
            cur.execute("""
                INSERT INTO dongha_subscription_snapshot
                    (snapshot_date, target_month, branch, total_count, maintain_count,
                     return_count, term_convert_count, churn_count,
                     pending_cancel_count, undecided_count, churn_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (snapshot_date, target_month, branch) DO UPDATE SET
                    total_count=EXCLUDED.total_count, maintain_count=EXCLUDED.maintain_count,
                    return_count=EXCLUDED.return_count,
                    term_convert_count=EXCLUDED.term_convert_count,
                    churn_count=EXCLUDED.churn_count,
                    pending_cancel_count=EXCLUDED.pending_cancel_count,
                    undecided_count=EXCLUDED.undecided_count,
                    churn_rate=EXCLUDED.churn_rate, created_at=NOW()
            """, (
                snapshot_date_str, target_month, branch,
                d["total_count"], d["maintain_count"], d["return_count"],
                d["term_convert_count"], d["churn_count"],
                d["pending_cancel_count"], d["undecided_count"], d["churn_rate"],
            ))

    print("[완료] 스냅샷 저장 완료")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="실적분석 스냅샷 생성")
    parser.add_argument("--month", help="대상 월 (YYYY-MM)", default=None)
    parser.add_argument("--date", help="스냅샷 기준일 (YYYY-MM-DD)", default=None)
    args = parser.parse_args()
    run_snapshot(target_month=args.month, snapshot_date_str=args.date)
