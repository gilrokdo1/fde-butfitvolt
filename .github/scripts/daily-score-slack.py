"""
FDE 일일 점수 슬랙 공지 메시지 생성.

EC2 로컬에서 실행 — FDE DB를 직접 조회해 랭킹 + 전일 대비 변화량을 계산하고,
Claude로 총평을 붙여 슬랙 메시지 본문을 stdout 으로 출력한다.

GH Actions 워크플로우가 SSH로 이 스크립트를 실행 → stdout 을 받아 슬랙 웹훅으로 전송.

환경변수:
- 표준 FDE DB env (FDE_DB_HOST 등) — backend/fde/.env 재사용
- ANTHROPIC_API_KEY — Claude 총평용 (없으면 총평 생략)
"""
import os
import sys
from datetime import date, timedelta

BACKEND_DIR = os.environ.get("FDE_BACKEND_DIR", "/home/ec2-user/fde1/fde-backend")
sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

import anthropic
from utils.db import safe_db

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FDE_URL = "https://fde.butfitvolt.click/fde"


def fetch_data():
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name, problem_score, score_reason
            FROM member_scores
            ORDER BY (member_name = '도길록') ASC, problem_score DESC, member_name ASC
        """)
        ranking = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS today")
        today = cur.fetchone()["today"]

        cur.execute("""
            SELECT member_name,
                   AVG(problem_score)::float AS avg_score
            FROM score_history
            WHERE (evaluated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date = %s
            GROUP BY member_name
        """, (today - timedelta(days=1),))
        yday = {r["member_name"]: r["avg_score"] for r in cur.fetchall()}

    rank_counter = 0
    for r in ranking:
        if r["member_name"] == "도길록":
            r["rank"] = None
            r["excluded"] = True
        else:
            rank_counter += 1
            r["rank"] = rank_counter
            r["excluded"] = False
        cur_score = float(r["problem_score"] or 0)
        prev = yday.get(r["member_name"])
        r["problem_score"] = cur_score
        r["diff"] = None if prev is None else round(cur_score - prev, 1)
    return today, ranking


def commentary(ranking):
    if not ANTHROPIC_API_KEY:
        return ""
    lines = []
    for e in ranking:
        if e.get("excluded"):
            continue
        diff = e["diff"]
        diff_str = f"{diff:+.1f}" if diff is not None else "첫 평가"
        reason = (e.get("score_reason") or "").strip().replace("\n", " ")[:300]
        lines.append(
            f"{e['rank']}위 {e['member_name']} {e['problem_score']:.1f}점 ({diff_str}) — {reason}"
        )
    prompt = (
        "아래는 버핏서울 FDE 멤버들의 오늘 문제해결 점수 랭킹, 전일 대비 변화량, 점수 사유입니다.\n\n"
        + "\n".join(lines)
        + "\n\n이 데이터를 바탕으로 슬랙에 올릴 짧은 총평을 써주세요.\n"
        "- 3~5줄, 한국어, 친근한 동료 톤 (존댓말)\n"
        "- 점수가 크게 오른 사람 한두 명을 구체적으로 칭찬 (무엇을 잘했는지)\n"
        "- 하위권이거나 점수가 낮은 사람에게는 분발을 독려하되 가볍고 따뜻하게\n"
        "- 이모지 1~2개 정도만\n"
        "총평 본문만 출력."
    )
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def format_message(today, ranking, comment):
    out = [f":trophy: *{today.isoformat()} FDE 문제해결 점수 업데이트*", ""]
    for e in ranking:
        d = e["diff"]
        if d is None:
            ds = "(첫 평가)"
        elif d > 0:
            ds = f"(↑{d:.1f})"
        elif d < 0:
            ds = f"(↓{abs(d):.1f})"
        else:
            ds = "(±0)"
        if e.get("excluded"):
            out.append(f"_(운영)_ {e['member_name']}  *{e['problem_score']:.1f}점*  {ds}")
        else:
            out.append(f"{e['rank']}위  {e['member_name']}  *{e['problem_score']:.1f}점*  {ds}")
    if comment:
        out += ["", comment]
    out += ["", f"<{FDE_URL}|랭킹 보러가기>"]
    return "\n".join(out)


if __name__ == "__main__":
    today, ranking = fetch_data()
    msg = format_message(today, ranking, commentary(ranking))
    print(msg)
