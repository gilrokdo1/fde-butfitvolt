"""트레이너 평가 스냅샷 크론잡 — 기본 매일 새벽 4:30 실행.

replica DB에서 월별×트레이너×지점으로 4개 지표 집계 → FDE DB `dongha_trainer_monthly`에 UPSERT.

실행:
  # 최근 15개월 (기본)
  python -m jobs.trainer_snapshot

  # 기간 지정
  python -m jobs.trainer_snapshot --start 2025-01 --end 2026-03

  # 단일 월
  python -m jobs.trainer_snapshot --month 2026-03
"""
import argparse
import os
import sys
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import safe_db
from utils.trainer_queries import (
    fetch_trainer_active_members,
    fetch_trainer_completion,
    fetch_trainer_conversion,
    fetch_trainer_directory,
    fetch_trainer_rereg,
    fetch_trainer_sessions,
)


def _month_list(start_month: str, end_month: str) -> list[str]:
    """'2025-01' ~ '2026-03' → ['2025-01', ..., '2026-03']."""
    sy, sm = int(start_month[:4]), int(start_month[5:7])
    ey, em = int(end_month[:4]), int(end_month[5:7])
    cur = date(sy, sm, 1)
    last = date(ey, em, 1)
    out = []
    while cur <= last:
        out.append(cur.strftime("%Y-%m"))
        cur = cur + relativedelta(months=1)
    return out


def _default_range() -> tuple[str, str]:
    """기본: 2025-01 ~ 어제 소속 월."""
    yesterday = date.today() - timedelta(days=1)
    return "2025-01", yesterday.strftime("%Y-%m")


def _record_status(
    job_name: str,
    *,
    started: bool = False,
    success: bool | None = None,
    rows_written: int | None = None,
    error_stage: str | None = None,
    error_message: str | None = None,
    error_traceback: str | None = None,
    duration_sec: float | None = None,
):
    """dongha_snapshot_status UPSERT — 잡 실행 결과를 DB 에 기록 (silent failure 방지)."""
    try:
        from datetime import datetime
        with safe_db("fde") as (_conn, cur):
            if started:
                cur.execute("""
                    INSERT INTO dongha_snapshot_status (job_name, last_started)
                    VALUES (%s, NOW())
                    ON CONFLICT (job_name) DO UPDATE SET last_started = NOW()
                """, (job_name,))
            else:
                cur.execute("""
                    INSERT INTO dongha_snapshot_status
                        (job_name, last_finished, success, rows_written,
                         error_stage, error_message, error_traceback, duration_sec)
                    VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (job_name) DO UPDATE SET
                        last_finished = NOW(),
                        success = EXCLUDED.success,
                        rows_written = EXCLUDED.rows_written,
                        error_stage = EXCLUDED.error_stage,
                        error_message = EXCLUDED.error_message,
                        error_traceback = EXCLUDED.error_traceback,
                        duration_sec = EXCLUDED.duration_sec
                """, (
                    job_name, success, rows_written,
                    error_stage, error_message, error_traceback, duration_sec,
                ))
    except Exception as e:
        # 상태 기록 실패는 핵심 잡 흐름을 막지 않음
        print(f"[snapshot status] 기록 실패: {e}")


def run_snapshot(
    start_month: str | None = None,
    end_month: str | None = None,
    snapshot_date_str: str | None = None,
):
    if not snapshot_date_str:
        snapshot_date_str = (date.today() - timedelta(days=1)).isoformat()
    if not start_month or not end_month:
        s, e = _default_range()
        start_month = start_month or s
        end_month = end_month or e

    months = _month_list(start_month, end_month)
    print(f"[trainer_snapshot] 시작: {start_month} ~ {end_month} ({len(months)}개월), snapshot={snapshot_date_str}")

    # 트레이너 디렉토리 (id → name) 1회 로드
    with safe_db("replica") as (_conn, cur):
        directory = fetch_trainer_directory(cur)
    print(f"  트레이너 디렉토리: {len(directory)}명")

    total_rows = 0
    for idx, target_month in enumerate(months, 1):
        print(f"\n[{idx}/{len(months)}] {target_month} 집계…")

        with safe_db("replica") as (_conn, cur):
            active = fetch_trainer_active_members(cur, target_month)
        with safe_db("replica") as (_conn, cur):
            sessions = fetch_trainer_sessions(cur, target_month)
        with safe_db("replica") as (_conn, cur):
            conv = fetch_trainer_conversion(cur, target_month)
        with safe_db("replica") as (_conn, cur):
            rereg = fetch_trainer_rereg(cur, target_month)

        # 모든 (trainer_user_id, branch) 키를 합집합
        keys = set(active) | set(sessions) | set(conv) | set(rereg)
        print(f"  → 지표별 키: active {len(active)}, sessions {len(sessions)}, conv {len(conv)}, rereg {len(rereg)} / 병합 {len(keys)}")

        if not keys:
            continue

        with safe_db("fde") as (_conn, cur):
            for trainer_id, branch in keys:
                a = active.get((trainer_id, branch), {})
                s = sessions.get((trainer_id, branch), {})
                c = conv.get((trainer_id, branch), {})
                r = rereg.get((trainer_id, branch), {})

                name = (
                    a.get("trainer_name")
                    or s.get("trainer_name")
                    or c.get("trainer_name")
                    or r.get("trainer_name")
                    or directory.get(trainer_id)
                )
                # 공백·제로폭 변이로 인한 중복 키 방지
                name = name.strip() if isinstance(name, str) else name
                branch_clean = branch.strip() if isinstance(branch, str) else branch

                cur.execute("""
                    INSERT INTO dongha_trainer_monthly
                        (snapshot_date, target_month, trainer_user_id, trainer_name, branch,
                         active_members, active_members_trial, sessions_done,
                         trial_end_count, trial_convert_count,
                         regular_end_count, regular_rereg_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (snapshot_date, target_month, trainer_user_id, branch) DO UPDATE SET
                        trainer_name = EXCLUDED.trainer_name,
                        active_members = EXCLUDED.active_members,
                        active_members_trial = EXCLUDED.active_members_trial,
                        sessions_done = EXCLUDED.sessions_done,
                        trial_end_count = EXCLUDED.trial_end_count,
                        trial_convert_count = EXCLUDED.trial_convert_count,
                        regular_end_count = EXCLUDED.regular_end_count,
                        regular_rereg_count = EXCLUDED.regular_rereg_count,
                        created_at = NOW()
                """, (
                    snapshot_date_str, target_month, trainer_id, name, branch_clean,
                    a.get("active_regular", 0),
                    a.get("active_trial", 0),
                    s.get("sessions_done", 0),
                    c.get("trial_end_count", 0),
                    c.get("trial_convert_count", 0),
                    r.get("regular_end_count", 0),
                    r.get("regular_rereg_count", 0),
                ))
                total_rows += 1

    # ── 완료된 PT 멤버십 per-row 스냅샷 (시작월 cohort 집계용) ──
    completion_inserted = 0
    try:
        print(f"\n[완료 멤버십] {start_month} ~ {end_month} 구간 조회…")
        with safe_db("replica") as (_conn, cur):
            completions = fetch_trainer_completion(cur, start_month, end_month)
        print(f"  완료 멤버십: {len(completions)}건")

        if completions:
            with safe_db("fde") as (_conn, cur):
                for c in completions:
                    # trainer_name fallback (담당트레이너 NULL 대비) + 공백 정규화
                    name = c.get("trainer_name") or directory.get(c["trainer_user_id"])
                    if isinstance(name, str):
                        name = name.strip()
                    branch_clean = c["branch"].strip() if isinstance(c.get("branch"), str) else c.get("branch")
                    begin = c["begin_date"]
                    target_month_for_row = begin.strftime("%Y-%m") if begin else None
                    if not target_month_for_row:
                        continue
                    cur.execute("""
                        INSERT INTO dongha_trainer_completion
                            (snapshot_date, target_month, trainer_user_id, trainer_name, branch,
                             contact, begin_date, end_date, last_session_date,
                             total_sessions, days_used, membership_name, member_name)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (snapshot_date, trainer_user_id, contact, begin_date) DO UPDATE SET
                            target_month = EXCLUDED.target_month,
                            trainer_name = EXCLUDED.trainer_name,
                            branch = EXCLUDED.branch,
                            end_date = EXCLUDED.end_date,
                            last_session_date = EXCLUDED.last_session_date,
                            total_sessions = EXCLUDED.total_sessions,
                            days_used = EXCLUDED.days_used,
                            membership_name = EXCLUDED.membership_name,
                            member_name = EXCLUDED.member_name,
                            created_at = NOW()
                    """, (
                        snapshot_date_str,
                        target_month_for_row,
                        c["trainer_user_id"],
                        name,
                        branch_clean,
                        c["contact"],
                        c["begin_date"],
                        c["end_date"],
                        c["last_session_date"],
                        c["total_sessions"],
                        c["days_used"],
                        c["membership_name"],
                        c.get("member_name"),
                    ))
                    completion_inserted += 1
        print(f"  완료 UPSERT: {completion_inserted}건")
    except Exception as e:
        print(f"[완료 멤버십 오류] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

    # sanity check
    with safe_db("fde") as (_conn, cur):
        cur.execute("""
            SELECT COUNT(*) AS n,
                   SUM(active_members) AS am,
                   SUM(sessions_done) AS sd
            FROM dongha_trainer_monthly
            WHERE snapshot_date = %s
              AND target_month BETWEEN %s AND %s
        """, (snapshot_date_str, start_month, end_month))
        row = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*) AS n
            FROM dongha_trainer_completion
            WHERE snapshot_date = %s
              AND target_month BETWEEN %s AND %s
        """, (snapshot_date_str, start_month, end_month))
        comp_row = cur.fetchone()

    print(f"\n[sanity check]")
    print(f"  monthly 총 행: {row['n']} / 유효회원 합: {row['am']} / 세션 합: {row['sd']}")
    print(f"  completion 총 행: {comp_row['n']}")
    print(f"[완료] UPSERT {total_rows}건 (monthly), {completion_inserted}건 (completion)")
    return total_rows + completion_inserted


def run_snapshot_with_status(*args, **kwargs):
    """run_snapshot wrapper - dongha_snapshot_status 에 결과 기록.

    백그라운드 스레드에서 silent fail 하던 문제 방지. UI에서 마지막 실행 시각/성공
    여부/에러를 직접 확인 가능.
    """
    import time
    import traceback as _tb
    started = time.time()
    _record_status("trainer_snapshot", started=True)
    try:
        rows_total = run_snapshot(*args, **kwargs)
        _record_status(
            "trainer_snapshot",
            success=True,
            rows_written=int(rows_total or 0),
            duration_sec=round(time.time() - started, 2),
        )
        return rows_total
    except Exception as e:
        _record_status(
            "trainer_snapshot",
            success=False,
            error_stage="run_snapshot",
            error_message=f"{type(e).__name__}: {e}",
            error_traceback=_tb.format_exc()[-2000:],
            duration_sec=round(time.time() - started, 2),
        )
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="트레이너 평가 스냅샷")
    parser.add_argument("--start", help="시작 월 YYYY-MM", default=None)
    parser.add_argument("--end", help="종료 월 YYYY-MM", default=None)
    parser.add_argument("--month", help="단일 월 지정 (start=end)", default=None)
    parser.add_argument("--date", help="스냅샷 기준일 YYYY-MM-DD", default=None)
    args = parser.parse_args()

    if args.month:
        run_snapshot(start_month=args.month, end_month=args.month, snapshot_date_str=args.date)
    else:
        run_snapshot(start_month=args.start, end_month=args.end, snapshot_date_str=args.date)
