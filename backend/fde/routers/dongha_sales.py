"""김동하 실적분석 API 라우터 — 스냅샷 데이터 조회."""
from datetime import date, timedelta

from fastapi import APIRouter, Query

from utils.db import safe_db

router = APIRouter(prefix="/fde-api/dongha/sales", tags=["dongha-sales"])


def _default_month():
    return (date.today() - timedelta(days=1)).strftime("%Y-%m")


def _latest_snapshot_date(cur, table: str, month: str, snap_date: str = None) -> str | None:
    if snap_date:
        return snap_date
    cur.execute(
        f"SELECT MAX(snapshot_date) AS d FROM {table} WHERE target_month = %s",
        (month,),
    )
    row = cur.fetchone()
    return str(row["d"]) if row and row["d"] else None


@router.get("/available-dates")
def available_dates(month: str = Query(default=None)):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT DISTINCT snapshot_date FROM dongha_sales_snapshot WHERE target_month = %s ORDER BY snapshot_date DESC",
            (month,),
        )
        dates = [str(r["snapshot_date"]) for r in cur.fetchall()]
    return {"month": month, "dates": dates}


@router.get("/overview")
def overview(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_sales_snapshot", month, date_)
        if not sd:
            return {"data": None, "_meta": {"snapshot_date": None, "message": "스냅샷 없음"}}

        cur.execute("""
            SELECT
                SUM(ft_mbs + ft_option + ft_daily + ft_refund) AS ft_total,
                SUM(pt_mbs + pt_refund + pt_ansim) AS pt_total,
                SUM(ft_target) AS ft_target,
                SUM(pt_target) AS pt_target
            FROM dongha_sales_snapshot
            WHERE snapshot_date = %s AND target_month = %s
        """, (sd, month))
        sales = cur.fetchone()

        cur.execute("""
            SELECT SUM(bs1_count) AS bs1, SUM(target_count) AS bs1_target
            FROM dongha_ft_new_snapshot
            WHERE snapshot_date = %s AND target_month = %s
        """, (sd, month))
        ft_new = cur.fetchone()

        cur.execute("""
            SELECT SUM(target_count) AS targets, SUM(paid_count) AS paid, SUM(pre_paid_count) AS pre_paid
            FROM dongha_rereg_snapshot
            WHERE snapshot_date = %s AND target_month = %s AND category = 'FT'
        """, (sd, month))
        rereg = cur.fetchone()

        cur.execute("""
            SELECT SUM(total_count) AS total, SUM(churn_count + pending_cancel_count) AS churn
            FROM dongha_subscription_snapshot
            WHERE snapshot_date = %s AND target_month = %s
        """, (sd, month))
        sub = cur.fetchone()

    ft_total = int(sales["ft_total"] or 0)
    pt_total = int(sales["pt_total"] or 0)
    ft_target = int(sales["ft_target"] or 0)
    pt_target = int(sales["pt_target"] or 0)
    total_revenue = ft_total + pt_total
    total_target = ft_target + pt_target

    bs1 = int(ft_new["bs1"] or 0)
    bs1_target = int(ft_new["bs1_target"] or 0)

    rereg_targets = int(rereg["targets"] or 0)
    rereg_paid = int(rereg["paid"] or 0)
    rereg_pre = int(rereg["pre_paid"] or 0)
    rereg_rate = round((rereg_paid + rereg_pre) / rereg_targets * 100, 1) if rereg_targets > 0 else 0

    sub_total = int(sub["total"] or 0)
    sub_churn = int(sub["churn"] or 0)
    churn_rate = round(sub_churn / sub_total * 100, 1) if sub_total > 0 else 0

    return {
        "data": {
            "revenue": {"ft": ft_total, "pt": pt_total, "total": total_revenue, "target": total_target,
                        "rate": round(total_revenue / total_target * 100, 1) if total_target > 0 else 0},
            "bs1": {"count": bs1, "target": bs1_target,
                    "rate": round(bs1 / bs1_target * 100, 1) if bs1_target > 0 else 0},
            "rereg": {"targets": rereg_targets, "paid": rereg_paid, "pre_paid": rereg_pre, "rate": rereg_rate},
            "churn": {"total": sub_total, "churn": sub_churn, "rate": churn_rate},
        },
        "_meta": {"snapshot_date": sd, "target_month": month},
    }


@router.get("/revenue")
def revenue(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_sales_snapshot", month, date_)
        if not sd:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT branch, ft_mbs, ft_option, ft_daily, ft_refund,
                   pt_mbs, pt_refund, pt_ansim, ft_target, pt_target
            FROM dongha_sales_snapshot
            WHERE snapshot_date = %s AND target_month = %s
            ORDER BY branch
        """, (sd, month))
        rows = cur.fetchall()

    data = []
    for r in rows:
        ft = int(r["ft_mbs"]) + int(r["ft_option"]) + int(r["ft_daily"]) + int(r["ft_refund"])
        pt = int(r["pt_mbs"]) + int(r["pt_refund"]) + int(r["pt_ansim"])
        ft_target = int(r["ft_target"] or 0)
        pt_target = int(r["pt_target"] or 0)
        data.append({
            "branch": r["branch"],
            "ft": ft, "ft_target": ft_target,
            "ft_rate": round(ft / ft_target * 100, 1) if ft_target > 0 else 0,
            "pt": pt, "pt_target": pt_target,
            "pt_rate": round(pt / pt_target * 100, 1) if pt_target > 0 else 0,
            "total": ft + pt, "target": ft_target + pt_target,
            "total_rate": round((ft + pt) / (ft_target + pt_target) * 100, 1) if (ft_target + pt_target) > 0 else 0,
        })
    return {"data": data, "_meta": {"snapshot_date": sd, "target_month": month, "row_count": len(data)}}


@router.get("/ft-new")
def ft_new(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_ft_new_snapshot", month, date_)
        if not sd:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT branch, bs1_count, bs1_revenue,
                   prev_month_same_period, prev_year_same_period,
                   prev_month_full, prev_year_full,
                   target_count, target_revenue
            FROM dongha_ft_new_snapshot
            WHERE snapshot_date = %s AND target_month = %s
            ORDER BY branch
        """, (sd, month))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"snapshot_date": sd, "target_month": month, "row_count": len(rows)}}


@router.get("/pt-trial")
def pt_trial(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_pt_trial_snapshot", month, date_)
        if not sd:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT branch, trial_count, trial_revenue, solo_count, combo_count,
                   conversion_target, conversion_count, conversion_revenue,
                   target_trial, target_conversion
            FROM dongha_pt_trial_snapshot
            WHERE snapshot_date = %s AND target_month = %s
            ORDER BY branch
        """, (sd, month))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"snapshot_date": sd, "target_month": month, "row_count": len(rows)}}


@router.get("/rereg")
def rereg(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_rereg_snapshot", month, date_)
        if not sd:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT branch, category, period_type,
                   target_count, pre_paid_count, paid_count, rereg_rate, target_rate
            FROM dongha_rereg_snapshot
            WHERE snapshot_date = %s AND target_month = %s
            ORDER BY branch
        """, (sd, month))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"snapshot_date": sd, "target_month": month, "row_count": len(rows)}}


@router.get("/subscription")
def subscription(month: str = Query(default=None), date_: str = Query(default=None, alias="date")):
    month = month or _default_month()
    with safe_db("fde") as (conn, cur):
        sd = _latest_snapshot_date(cur, "dongha_subscription_snapshot", month, date_)
        if not sd:
            return {"data": [], "_meta": {"snapshot_date": None}}
        cur.execute("""
            SELECT branch, total_count, maintain_count, return_count,
                   term_convert_count, churn_count, pending_cancel_count,
                   undecided_count, churn_rate
            FROM dongha_subscription_snapshot
            WHERE snapshot_date = %s AND target_month = %s
            ORDER BY branch
        """, (sd, month))
        rows = [dict(r) for r in cur.fetchall()]
    return {"data": rows, "_meta": {"snapshot_date": sd, "target_month": month, "row_count": len(rows)}}
