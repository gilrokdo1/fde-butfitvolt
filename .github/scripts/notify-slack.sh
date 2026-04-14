#!/usr/bin/env bash
# Slack 알림 래퍼.
# 사용법: ./notify-slack.sh <success|fail|warn|info> "제목" "본문" "github-username"
set -euo pipefail

STATUS="${1:-info}"
TITLE="${2:-알림}"
BODY="${3:-}"
GH_USER="${4:-}"

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "SLACK_WEBHOOK_URL 미설정 — 알림 스킵"
  exit 0
fi

SLACK_ID=""
if [ -n "$GH_USER" ] && [ -f ".github/slack-users.json" ]; then
  SLACK_ID=$(GH_USER="$GH_USER" python3 -c '
import json, os
try:
    with open(".github/slack-users.json") as f:
        print(json.load(f).get(os.environ["GH_USER"], ""))
except Exception:
    print("")
')
fi

case "$STATUS" in
  success) EMOJI=":white_check_mark:" ;;
  fail)    EMOJI=":x:" ;;
  warn)    EMOJI=":warning:" ;;
  *)       EMOJI=":information_source:" ;;
esac

MENTION=""
if [ -n "$SLACK_ID" ]; then
  MENTION=" — <@${SLACK_ID}>"
elif [ -n "$GH_USER" ]; then
  MENTION=" — @${GH_USER}(Slack 매핑 없음)"
fi

TEXT="${EMOJI} *${TITLE}*${MENTION}"
[ -n "$BODY" ] && TEXT="${TEXT}"$'\n'"${BODY}"

PAYLOAD=$(TEXT="$TEXT" python3 -c '
import json, os
print(json.dumps({"text": os.environ["TEXT"]}))
')

curl -sS -X POST -H 'Content-Type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" > /dev/null
echo "Slack 알림 전송 완료 (status=$STATUS, user=$GH_USER)"
