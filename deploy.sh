#!/bin/bash

#==============================================================================
# BUTFITSEOUL FDE 1기 — 프론트엔드 배포 스크립트
#==============================================================================
# 사용법:
#   ./deploy.sh              - ERP 프론트엔드 배포 (기본)
#   ./deploy.sh erp          - ERP 프론트엔드 배포
#   ./deploy.sh fde-backend  - FDE 백엔드 배포
#   ./deploy.sh lukete       - 루케테80 환불 대시보드(Streamlit) 배포
#
# 정적 파일 교체 방식 (무중단):
# 1. 로컬에서 빌드
# 2. EC2에 업로드
# 3. Nginx 서빙 경로에 교체
#==============================================================================

# macOS Homebrew PATH 보장 (node, pnpm 등)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 스크립트 위치 기준으로 프로젝트 루트 설정
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 배포 모드 설정
DEPLOY_MODE="${1:-erp}"

#==============================================================================
# FDE 백엔드 배포 (바로 실행 후 종료)
#==============================================================================
if [ "$DEPLOY_MODE" = "fde-backend" ]; then
    EC2_HOST="13.209.66.148"
    EC2_USER="ec2-user"
    PEM_KEY="BUTFITSEOUL_FDE1.pem"
    SSH_OPTS="-i $PEM_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
    REMOTE="$EC2_USER@$EC2_HOST"

    echo -e "\033[0;34m🚀 FDE 백엔드 배포 중...\033[0m"
    rsync -avz --delete --exclude='__pycache__' --exclude='.env' --exclude='*.pyc' \
        -e "ssh $SSH_OPTS" \
        backend/fde/ "$REMOTE:~/fde1/fde-backend/" 2>&1
    # python3.11 명시: EC2의 python3이 3.9를 가리킬 수 있으므로, 우리 코드(int|None 등 3.10+ 문법)에 맞는 site-packages에 설치되도록.
    # set -e + is-active 로 사일런트 실패 차단 — pip 실패나 crashloop 시 즉시 SSH 종료(비0) → GH Actions 빨갛게 표시.
    ssh $SSH_OPTS $REMOTE "
      set -e
      cd ~/fde1/fde-backend
      python3.11 -m pip install -r requirements.txt -q --user
      sudo systemctl restart fde-backend
      sleep 3
      sudo systemctl is-active --quiet fde-backend
    " 2>&1
    echo -e "\033[0;32m✅ FDE 백엔드 배포 완료\033[0m"
    exit 0
fi

#==============================================================================
# 루케테80 환불 대시보드 배포 (Streamlit)
#==============================================================================
if [ "$DEPLOY_MODE" = "lukete" ]; then
    EC2_HOST="13.209.66.148"
    EC2_USER="ec2-user"
    PEM_KEY="BUTFITSEOUL_FDE1.pem" # gitleaks:allow (PEM 파일명일 뿐 키 자체 아님)
    SSH_OPTS="-i $PEM_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
    REMOTE="$EC2_USER@$EC2_HOST"
    REMOTE_DIR="~/fde1/lukete"

    echo -e "\033[0;34m🚀 루케테80 대시보드 배포 중...\033[0m"
    ssh $SSH_OPTS $REMOTE "mkdir -p $REMOTE_DIR" 2>&1
    rsync -avz --delete \
        --exclude='__pycache__' --exclude='.pytest_cache' \
        --exclude='.env' --exclude='*.pyc' \
        --exclude='venv/' --exclude='.venv/' \
        -e "ssh $SSH_OPTS" \
        backend/lukete/ "$REMOTE:$REMOTE_DIR/" 2>&1

    # set -e: pip 실패, 서비스 crashloop, nginx 미설정 시 즉시 종료 (사일런트 실패 차단)
    ssh $SSH_OPTS $REMOTE "
      set -e
      cd ~/fde1/lukete

      # .env 필수
      if [ ! -f .env ]; then
          echo '❌ ~/fde1/lukete/.env 없음. SCP 필요:'
          echo '   scp -i BUTFITSEOUL_FDE1.pem backend/lukete/.env ec2-user@${EC2_HOST}:${REMOTE_DIR}/'
          exit 1
      fi

      # venv + 의존성
      (test -d venv || python3.11 -m venv venv)
      ./venv/bin/pip install -q -r requirements.txt

      # systemd 유닛 — 내용이 다르면 갱신 (최초 등록 포함)
      if ! sudo diff -q lukete.service /etc/systemd/system/lukete.service >/dev/null 2>&1; then
          sudo cp lukete.service /etc/systemd/system/
          sudo systemctl daemon-reload
          sudo systemctl enable lukete 2>/dev/null || true
      fi

      # Nginx 프록시 확인 (없으면 배포 중단 — ec2_first_setup.sh 1회 실행 필요)
      if ! sudo grep -qr 'location /lukete/' /etc/nginx/conf.d/ 2>/dev/null; then
          echo '❌ Nginx /lukete/ 프록시 미설정 — 1회 부트스트랩 필요:'
          echo '   ssh -i BUTFITSEOUL_FDE1.pem ec2-user@${EC2_HOST}'
          echo '   bash ~/fde1/lukete/scripts/ec2_first_setup.sh'
          exit 1
      fi

      # 서비스 재시작 + 헬스체크
      sudo systemctl restart lukete
      sleep 3
      sudo systemctl is-active --quiet lukete
    " 2>&1
    echo -e "\033[0;32m✅ 루케테80 대시보드 배포 완료\033[0m"
    echo -e "\033[0;32m🌐 https://fde.butfitvolt.click/lukete/\033[0m"
    exit 0
fi

# Variables
EC2_HOST="13.209.66.148"
EC2_USER="ec2-user"
PEM_KEY="BUTFITSEOUL_FDE1.pem"
REMOTE="$EC2_USER@$EC2_HOST"

# SSH 멀티플렉싱: 첫 연결만 핸드셰이크, 이후 재사용
SSH_MUX="/tmp/ssh-fde1-%r@%h:%p"
SSH_OPTS="-i $PEM_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 -o ControlMaster=auto -o ControlPath=$SSH_MUX -o ControlPersist=60"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Deploy Lock
DEPLOY_LOCK="/tmp/fde1.deploy.lock"

log() {
    echo -e "$1"
}

run_ssh() {
    local t=${1%s}
    shift
    if command -v gtimeout >/dev/null 2>&1; then
        gtimeout "${t}s" ssh $SSH_OPTS $REMOTE "$@" 2>&1
    elif command -v timeout >/dev/null 2>&1; then
        timeout "${t}s" ssh $SSH_OPTS $REMOTE "$@" 2>&1
    else
        local output_file=$(mktemp /tmp/ssh_out.XXXXXX)
        ssh $SSH_OPTS $REMOTE "$@" > "$output_file" 2>&1 &
        local ssh_pid=$!
        local elapsed=0
        while kill -0 $ssh_pid 2>/dev/null; do
            if [ $elapsed -ge $t ]; then
                kill -9 $ssh_pid 2>/dev/null
                wait $ssh_pid 2>/dev/null
                cat "$output_file"
                rm -f "$output_file"
                return 124
            fi
            sleep 1
            elapsed=$((elapsed + 1))
        done
        wait $ssh_pid 2>/dev/null
        local exit_code=$?
        cat "$output_file"
        rm -f "$output_file"
        return $exit_code
    fi
    return ${PIPESTATUS[0]}
}

# 배포 Lock 확인 (10분 이상 된 락은 자동 해제)
if [ -f "$DEPLOY_LOCK" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$DEPLOY_LOCK" 2>/dev/null || stat -c %Y "$DEPLOY_LOCK" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -gt 600 ]; then
        log "${YELLOW}⚠ 10분 이상 된 배포 락 자동 해제${NC} (${LOCK_AGE}초 경과)"
        rm -f "$DEPLOY_LOCK"
    else
        LOCK_INFO=$(cat "$DEPLOY_LOCK")
        log "${RED}❌ 다른 배포가 진행 중입니다${NC}"
        log "   배포자: $LOCK_INFO"
        log "   1분 뒤 재시도하세요 (lock 파일 직접 삭제 금지)"
        exit 1
    fi
fi

# Lock 설정 및 종료 시 자동 해제
echo "$(whoami) @ $(date '+%Y-%m-%d %H:%M:%S')" > "$DEPLOY_LOCK"
trap "rm -f $DEPLOY_LOCK; ssh -O exit -o ControlPath=$SSH_MUX $REMOTE 2>/dev/null || true" EXIT

log "===================================="
log "${BLUE}BUTFITSEOUL FDE 1기 — Frontend Deploy${NC}"
log "${YELLOW}ERP Frontend${NC}"
log "Started at: $(date '+%Y-%m-%d %H:%M:%S')"
log "Deployer: $(whoami)"
log "===================================="
log ""

#==============================================================================
# ERP 프론트엔드 배포
#==============================================================================

DIST_DIR="frontend/packages/erp/dist"
WEBROOT="/var/www/erp"

# Step 1: 빌드
log "${BLUE}[1/4]${NC} Building ERP frontend..."
rm -rf "$DIST_DIR"
cd frontend && pnpm run build:erp 2>&1
BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
    # build:erp 스크립트가 없으면 개별 빌드 시도
    pnpm --filter @butfitvolt/erp build 2>&1
    BUILD_EXIT=$?
fi
if [ $BUILD_EXIT -ne 0 ]; then
    log "${RED}❌ ERP build failed${NC}"
    cd ..
    exit 1
fi
cd ..
log "${GREEN}✓ ERP built${NC}"

# Step 2: MacOS 메타데이터 정리
log ""
log "${BLUE}[2/4]${NC} Cleaning MacOS metadata files..."
find "$DIST_DIR" -name '._*' -delete 2>/dev/null || true
find "$DIST_DIR" -name '.DS_Store' -delete 2>/dev/null || true
log "${GREEN}✓ Metadata files cleaned${NC}"

# Step 3: 업로드
log ""
log "${BLUE}[3/4]${NC} Uploading ERP..."
run_ssh 5s "mkdir -p ~/fde1/frontend-erp"
rsync -avz --delete --exclude='._*' --exclude='.DS_Store' -e "ssh $SSH_OPTS" \
    "${DIST_DIR}/" "$REMOTE:~/fde1/frontend-erp/" 2>&1
log "${GREEN}✓ Files uploaded${NC}"

# Step 4: 배포 (Nginx 서빙 경로에 교체)
log ""
log "${BLUE}[4/4]${NC} Deploying ERP to ${WEBROOT}..."
run_ssh 10s "sudo mkdir -p ${WEBROOT} && sudo rm -rf ${WEBROOT}/* && sudo cp -r ~/fde1/frontend-erp/* ${WEBROOT}/ && sudo chown -R nginx:nginx ${WEBROOT}"
log "${GREEN}✓ ERP deployed${NC}"

# 최종 확인
log ""
log "===================================="
log "${GREEN}✅ ERP deployment completed!${NC}"
log "Completed at: $(date '+%Y-%m-%d %H:%M:%S')"
log "===================================="
log ""
log "🌐 Visit: https://fde.butfitvolt.click"
log "${YELLOW}💡 브라우저에서 Ctrl+Shift+R로 새로고침 필요${NC}"
log ""
