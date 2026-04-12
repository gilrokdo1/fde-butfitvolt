"""
FDE 멤버 문제해결 점수 평가 — 하루 1회 크론잡.
실행: python -m jobs.evaluate
"""
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anthropic
import requests

from utils.db import safe_db

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def _github_headers():
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def collect_github_data() -> str:
    if not GITHUB_REPO:
        return "GitHub 데이터 없음"

    prs = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/pulls",
        headers=_github_headers(),
        params={"state": "all", "per_page": 100},
        timeout=15,
    ).json()

    summary_lines = []
    for pr in prs:
        if not isinstance(pr, dict):
            continue
        user = (pr.get("user") or {}).get("login", "unknown")
        summary_lines.append(
            f"- PR #{pr.get('number')}: {pr.get('title')} (by @{user}, {pr.get('state')}, {pr.get('created_at', '')[:10]})"
        )

    return "\n".join(summary_lines) if summary_lines else "PR 없음"


def collect_visit_data() -> str:
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT page_path, COUNT(*) as visits, COUNT(DISTINCT user_id) as unique_visitors
            FROM page_visits
            WHERE page_path LIKE '/fde/%'
            GROUP BY page_path
            ORDER BY visits DESC
        """)
        rows = cur.fetchall()

    if not rows:
        return "방문 데이터 없음"

    lines = [f"- {r['page_path']}: {r['visits']}회 방문 ({r['unique_visitors']}명)" for r in rows]
    return "\n".join(lines)


def collect_previous_scores() -> str:
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name, problem_score, score_reason, evaluated_at
            FROM member_scores
            WHERE evaluated_at IS NOT NULL
            ORDER BY member_name
        """)
        rows = cur.fetchall()

    if not rows:
        return "이전 평가 없음"

    lines = [f"- {r['member_name']}: {r['problem_score']}점 ({r['evaluated_at']}) — {r['score_reason'][:100]}" for r in rows]
    return "\n".join(lines)


def get_member_list() -> list[str]:
    with safe_db("fde") as (conn, cur):
        cur.execute("SELECT member_name FROM member_scores ORDER BY member_name")
        return [r["member_name"] for r in cur.fetchall()]


def evaluate():
    members = get_member_list()
    if not members:
        print("평가할 멤버가 없습니다")
        return

    github_data = collect_github_data()
    visit_data = collect_visit_data()
    previous_scores = collect_previous_scores()

    prompt = f"""당신은 버핏서울 FDE(Frontend Developer Education) 프로그램의 평가 에이전트입니다.

## 평가 대상 멤버
{json.dumps(members, ensure_ascii=False)}

## GitHub 활동 (PR, 커밋)
{github_data}

## 페이지 방문 데이터 (실제 사용 여부)
{visit_data}

## 이전 평가 점수
{previous_scores}

## 평가 기준 (절대점수 0~100)
- **문제의 난이도** (비중 높음): 쉬운 문제 vs 조직의 근본적 문제
- **조직 임팩트** (비중 높음): 실제로 현장 업무에 변화를 줬는가
- **실제 사용 여부** (비중 높음): 방문 데이터로 확인 — 만들어놓고 아무도 안 쓰면 낮은 점수
- **완성도** (비중 중간): 계획만 거창하고 구현이 안 됐으면 낮은 점수
- **문제 정의** (비중 중간): 문제를 제대로 파악하고 접근했는가

## 절대점수 원칙
- 상대 비교가 아님 — 전원 0점일 수도, 전원 높을 수도 있음
- 작은 문제를 잘 해결 = 적절한 점수
- 큰 문제를 잘 해결 = 높은 점수
- 거창한 계획 + 미완성 구현 + 사용자 없음 = 낮은 점수

각 멤버에 대해 JSON 형식으로 응답해주세요:
```json
[
  {{"member_name": "이름", "problem_score": 0.0, "score_reason": "평가 근거 상세 설명"}}
]
```
JSON만 응답하세요. 다른 텍스트 없이."""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = response.content[0].text.strip()

    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0].strip()

    scores = json.loads(response_text)

    for entry in scores:
        name = entry["member_name"]
        score = float(entry["problem_score"])
        reason = entry["score_reason"]

        with safe_db("fde") as (conn, cur):
            cur.execute(
                """UPDATE member_scores
                   SET problem_score = %s, score_reason = %s, evaluated_at = NOW(), updated_at = NOW()
                   WHERE member_name = %s""",
                (score, reason, name),
            )

            cur.execute(
                "INSERT INTO score_history (member_name, problem_score, score_reason) VALUES (%s, %s, %s)",
                (name, score, reason),
            )

    print(f"평가 완료: {len(scores)}명")
    for s in scores:
        print(f"  {s['member_name']}: {s['problem_score']}점")


if __name__ == "__main__":
    evaluate()
