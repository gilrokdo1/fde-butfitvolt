#!/usr/bin/env bash
# Claude 리뷰 — PR diff를 Anthropic API에 보내 크리티컬 이슈를 찾고,
# 결과를 PR 코멘트로 달고, 크리티컬이면 exit 1 로 merge를 막는다.
#
# 필요 env:
#   ANTHROPIC_API_KEY  — Anthropic API 키
#   GH_TOKEN           — PR 댓글용 GitHub 토큰
#   PR_NUMBER          — 리뷰할 PR 번호
#   GITHUB_REPOSITORY  — owner/repo
set -euo pipefail

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY 필요}"
: "${GH_TOKEN:?GH_TOKEN 필요}"
: "${PR_NUMBER:?PR_NUMBER 필요}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY 필요}"

MODEL="${CLAUDE_MODEL:-claude-sonnet-4-5}"
MAX_DIFF_CHARS="${MAX_DIFF_CHARS:-80000}"

echo "🤖 PR #${PR_NUMBER} 리뷰 시작 (model=${MODEL})"

# 1) diff 수집
DIFF=$(gh pr diff "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}")
DIFF_LEN=${#DIFF}
echo "📏 diff 길이: ${DIFF_LEN}자"

if [ "${DIFF_LEN}" -gt "${MAX_DIFF_CHARS}" ]; then
  DIFF="${DIFF:0:${MAX_DIFF_CHARS}}

[... diff가 너무 커서 ${MAX_DIFF_CHARS}자에서 잘림 ...]"
fi

SYSTEM='당신은 버핏서울 FDE 프로젝트의 코드 리뷰어입니다. 크리티컬한 프로덕션 이슈만 찾고, 스타일/취향 이슈는 무시하세요.

**반드시 체크할 크리티컬 항목 (프로덕션을 망가뜨릴 수 있는 것):**
1. **환경별 URL/설정 하드코딩**: localhost, 127.0.0.1, 로컬 포트(8000/8002 등), 개발 DB/키/secret이 프로덕션 fallback으로 들어간 경우
2. **비밀키·토큰·비밀번호 하드코딩**
3. **파괴적 SQL**: DROP, TRUNCATE, 인덱스/컬럼 삭제, 조건없는 DELETE/UPDATE
4. **인증 우회·CORS 완화·권한 약화**
5. **명백한 런타임 에러**: null 역참조, 무한루프, 순환 import 등

**응답 형식(반드시 이 규칙 따를 것):**
- 크리티컬 이슈가 하나라도 있으면 첫 줄에 정확히 `VERDICT: CRITICAL` 을 쓰고 아래에 문제와 근거를 한국어로 나열.
- 크리티컬 이슈가 없으면 첫 줄에 정확히 `VERDICT: OK` 만 쓰고 끝.
- 애매한 경우 OK 로 판정. CRITICAL 은 명백한 프로덕션 파괴 이슈에만 사용.'

# 2) JSON payload 생성 (jq로 안전하게 이스케이프)
PAYLOAD=$(jq -n \
  --arg model "${MODEL}" \
  --arg system "${SYSTEM}" \
  --arg diff "${DIFF}" \
  '{
    model: $model,
    max_tokens: 2000,
    system: $system,
    messages: [
      { role: "user", content: ("다음 PR diff를 리뷰해줘:\n\n```diff\n" + $diff + "\n```") }
    ]
  }')

# 3) Anthropic API 호출
RESP=$(curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "${PAYLOAD}")

# 4) 응답 파싱
REVIEW=$(echo "${RESP}" | jq -r '.content[0].text // (.error.message // "리뷰 응답 파싱 실패")')

if [ -z "${REVIEW}" ] || [ "${REVIEW}" = "null" ]; then
  echo "❌ Claude 응답이 비어 있음. 원본:"
  echo "${RESP}"
  exit 2
fi

echo "📝 Claude 응답:"
echo "${REVIEW}"
echo

# 5) PR 코멘트 작성
if echo "${REVIEW}" | head -1 | grep -q "VERDICT: CRITICAL"; then
  STATUS_EMOJI="🚨"
  STATUS_TEXT="크리티컬 이슈 발견 — 머지 차단"
  IS_CRITICAL=1
else
  STATUS_EMOJI="✅"
  STATUS_TEXT="문제 없음"
  IS_CRITICAL=0
fi

COMMENT_BODY=$(printf '## %s Claude 리뷰 — %s\n\n```\n%s\n```\n\n<sub>모델: %s</sub>' \
  "${STATUS_EMOJI}" "${STATUS_TEXT}" "${REVIEW}" "${MODEL}")

gh pr comment "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --body "${COMMENT_BODY}"

if [ "${IS_CRITICAL}" -eq 1 ]; then
  echo "🚨 크리티컬 이슈 — CI 실패 처리"
  exit 1
fi

echo "✅ 리뷰 통과"
