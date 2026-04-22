#!/bin/bash
# 루케테80 환불 대시보드 — EC2 1회 부트스트랩 (SSH 접속 후 1번만 실행)
#
# 동작:
#   1) .env 존재 여부 확인 (없으면 종료, 수동 SCP 필요)
#   2) Python venv + 의존성 설치
#   3) systemd 유닛 등록 + enable
#   4) Nginx /lukete/ 프록시 location 블록 추가 (fde.butfitvolt.click 서버 블록)
#   5) 서비스 기동 + 헬스체크
#
# 멱등: 이미 설정된 항목은 스킵. 재실행 안전.
#
# 사용:
#   ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148
#   bash ~/fde1/lukete/scripts/ec2_first_setup.sh
set -euo pipefail

LUKETE_DIR="$HOME/fde1/lukete"
cd "$LUKETE_DIR"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}▸${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ─────────────────────────────────────────────────────────────
log "1. .env 확인"
if [ ! -f .env ]; then
    fail ".env 없음. 로컬에서 SCP 후 재실행:
   scp -i BUTFITSEOUL_FDE1.pem backend/lukete/.env ec2-user@13.209.66.148:$LUKETE_DIR/"
fi
ok ".env 존재"

# ─────────────────────────────────────────────────────────────
log "2. Python venv + 의존성"
if [ ! -d venv ]; then
    python3.11 -m venv venv
fi
./venv/bin/pip install -q -r requirements.txt
ok "venv 준비 완료"

# ─────────────────────────────────────────────────────────────
log "3. systemd 유닛 등록"
if [ ! -f /etc/systemd/system/lukete.service ]; then
    sudo cp lukete.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable lukete
    ok "lukete.service 신규 등록"
else
    # 파일 내용이 바뀌었으면 갱신
    if ! sudo diff -q lukete.service /etc/systemd/system/lukete.service >/dev/null 2>&1; then
        sudo cp lukete.service /etc/systemd/system/
        sudo systemctl daemon-reload
        ok "lukete.service 갱신"
    else
        ok "lukete.service 기존 설정 유지"
    fi
fi

# ─────────────────────────────────────────────────────────────
log "4. Nginx /lukete/ 프록시"
CONF_FILE=$(sudo grep -rl "server_name.*fde.butfitvolt.click" /etc/nginx/conf.d/ 2>/dev/null | head -1 || true)
if [ -z "${CONF_FILE:-}" ]; then
    fail "fde.butfitvolt.click 설정 파일 못 찾음. /etc/nginx/conf.d/ 수동 확인 필요."
fi
log "  대상: $CONF_FILE"

if sudo grep -q "location /lukete/" "$CONF_FILE"; then
    ok "nginx 이미 설정됨"
else
    # 백업
    BACKUP="${CONF_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    sudo cp "$CONF_FILE" "$BACKUP"
    log "  백업: $BACKUP"

    # 서버 블록의 마지막 '}' 직전에 location 삽입 (Python 한 줄 삽입 — 중첩 '{}' 없는 단순 구조 가정)
    sudo python3 -c "
import re, sys
path = '$CONF_FILE'
block = '''
    # 루케테80 환불 대시보드 (Streamlit)
    location /lukete/ {
        proxy_pass http://127.0.0.1:8503;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_read_timeout 86400;
    }
'''
with open(path) as f:
    content = f.read()
# fde.butfitvolt.click 서버 블록 찾기 → 해당 블록의 닫는 '}' 앞에 삽입
m = re.search(r'(server\s*\{[^{}]*server_name[^;]*fde\.butfitvolt\.click[^{}]*(?:\{[^{}]*\}[^{}]*)*?)\s*\}', content)
if not m:
    sys.exit('server 블록 매칭 실패 — 수동 편집 필요')
insert_at = m.end() - 1  # 닫는 '}' 바로 앞
new = content[:insert_at] + block + content[insert_at:]
with open(path, 'w') as f:
    f.write(new)
"
    sudo nginx -t || { sudo mv "$BACKUP" "$CONF_FILE"; fail "nginx -t 실패 — 백업 복원"; }
    sudo systemctl reload nginx
    ok "nginx 프록시 추가 + reload"
fi

# ─────────────────────────────────────────────────────────────
log "5. 서비스 기동 + 헬스체크"
sudo systemctl restart lukete
sleep 3
if ! sudo systemctl is-active --quiet lukete; then
    sudo journalctl -u lukete -n 20 --no-pager
    fail "lukete 서비스 기동 실패"
fi
ok "lukete active"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8503/lukete/_stcore/health")
if [ "$HTTP_CODE" = "200" ]; then
    ok "로컬 헬스 200"
else
    warn "로컬 헬스 $HTTP_CODE — Streamlit 부팅 더 기다려야 할 수 있음"
fi

PUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://fde.butfitvolt.click/lukete/_stcore/health")
if [ "$PUB_CODE" = "200" ]; then
    ok "공개 엔드포인트 200 — 브라우저에서 https://fde.butfitvolt.click/lukete/ 접속 가능"
else
    warn "공개 엔드포인트 $PUB_CODE"
fi

echo ""
echo -e "${GREEN}🎉 루케테 EC2 세팅 완료${NC}"
echo "   https://fde.butfitvolt.click/lukete/"
echo "   FDE 페이지: https://fde.butfitvolt.click/fde/kim-dongha/lukete-refund"
