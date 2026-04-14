# CLAUDE.md — 버핏서울 FDE 1기

**한국어 사용 필수**: 응답, 주석, 커밋 메시지 모두 한국어.

**직접 처리 우선**: gh CLI, git, 파일 수정, API 호출 등 도구로 처리 가능한 작업은 유저에게 넘기지 말고 즉시 직접 실행한다. 단, 삭제·force push 등 파괴적 작업은 확인 후 진행.

## 프로젝트 개요

버핏서울 내부의 현장 문제를 각자가 직접 코드로 해결하는 FDE(Forward Deployed Engineer) 프로그램.
8명의 멤버가 하나의 EC2 + 하나의 GitHub 레포를 공유하며, **한 팀처럼** 일한다.

- 배포 URL: https://fde.butfitvolt.click
- GitHub: https://github.com/gilrokdo1/fde-butfitvolt
- EC2: `13.209.66.148` (PEM 키로 전원 접속)

## 핵심 철학

**개발팀에 요청하고 기다리지 않는다. 내 현장의 문제를 내가 직접 해결한다.**

- 프론트엔드든 백엔드든 DB든 — 필요하면 직접 만든다
- 다 같이 쓰는 레포 하나, 서버 하나 — 격리 없이 **한 팀처럼** 일한다
- 문제 생기면 같이 해결한다
- 모든 과정은 GitHub에서 투명하게 (PR, 커밋, 이슈)

## 🔴 처음 시작할 때 반드시 하는 것

### 1. Git 사용자 설정 (1회만, 필수)

**GitHub이 내 커밋을 내 계정과 연결하려면 반드시 GitHub에 등록된 이메일로 설정해야 한다.**
안 하면 랭킹 시스템에 "?" 로 잡혀서 GitHub 활동이 집계되지 않는다.

```bash
git config --global user.email "내-GitHub-이메일"
git config --global user.name "내-GitHub-username"
```

> 이메일은 https://github.com/settings/emails 에서 확인.
> 확인: `git config --global user.email` 했을 때 본인 GitHub 이메일이 나와야 함.

### 2. 레포 클론 + 의존성 설치

```bash
git clone https://github.com/gilrokdo1/fde-butfitvolt.git
cd fde-butfitvolt/frontend
pnpm install
```

### 3. 환경 변수

`frontend/packages/erp/.env.development` (이미 존재):
```
VITE_API_URL=http://localhost:8002
```

> 로컬 개발 시 FDE 백엔드를 로컬에 띄우거나, 또는 아래처럼 프로덕션 백엔드로 바로 붙어도 된다:
> `VITE_API_URL=https://fde.butfitvolt.click`

### 4. 개발 서버 실행

```bash
cd frontend
pnpm dev:erp  # http://localhost:5173
```

## 작업 규칙

### 커밋 메시지
- 형식: `feat: 이름 — 기능 설명` (예: `feat: 김동하 — 수업 출결 대시보드`)
- 한국어

### 배포
- 프론트엔드: `./deploy.sh erp`
- FDE 백엔드: `./deploy.sh fde-backend`
- 배포 락 발생 시 1분 대기 후 재시도 (lock 파일 직접 삭제 금지)

### Git 워크플로우
- **작업 전 반드시**: `git checkout main && git pull --rebase && git checkout -b feat/내기능`
  - 오래된 브랜치를 그대로 파면 workflow 파일이 없거나 main과 충돌 → 자동 배포가 안 걸림
- **작업 중에도 주기적으로**: `git fetch origin && git rebase origin/main` (또는 `git merge origin/main`)
- 각자 브랜치에서 작업 → PR → 메인 머지
- PR은 `gilrokdo1/fde-butfitvolt`에 직접
- 오래된 브랜치(하루 이상 main과 동떨어진 것)는 PR 올리기 전 반드시 main 동기화

### 자동 파이프라인이 안 걸렸을 때 체크리스트
PR 올렸는데 PR Check / Auto-merge 체크가 안 뜬다면:
1. 브랜치가 main에 뒤처져 있진 않은지 (`git log origin/main..HEAD`가 있어야 앞서 있음)
2. 브랜치에 `.github/workflows/*.yml` 파일이 있는지 (없으면 main merge로 가져오기)
3. 위 둘 다 해결해도 안 붙으면: PR 닫았다 재오픈 또는 새 커밋 1개 push

### EC2 접속 (필요할 때)
```bash
ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148
```
PEM 키는 슬랙 DM으로 받음. 레포에 커밋하지 않음 (`.gitignore`에 이미 등록됨).

## 시스템 구성

```
https://fde.butfitvolt.click
    ↓ (Nginx, EC2 13.209.66.148)
    ├── /           → React 프론트엔드 (/var/www/erp)
    └── /fde-api/*  → FDE FastAPI (포트 8002, systemd: fde-backend)
                          ↓
                          ├── FDE DB (로컬 PostgreSQL): 방문/랭킹/점수/자유 테이블
                          ├── replica DB (db-ro.butfit.io): 버핏서울 원본 읽기 전용
                          ├── GitHub API: PR/커밋 지표 수집
                          └── api.butfit.io: 로그인 인증 (→ FDE JWT 발급)
```

## 폴더 구조

```
05_버핏서울_FDE_1기/
├── frontend/packages/erp/src/
│   ├── pages/FDE/내이름/     # 각자 기능 개발
│   ├── api/fde.ts            # FDE 백엔드 API 호출
│   └── ...
├── backend/fde/              # FDE 백엔드 (FastAPI)
│   ├── main.py
│   ├── routers/
│   ├── utils/
│   ├── jobs/evaluate.py      # 문제해결 점수 평가 (하루 1회)
│   ├── schema.sql
│   └── EC2_SETUP.md
├── deploy.sh                 # ./deploy.sh erp / ./deploy.sh fde-backend
└── 프로젝트 가이드/
```

## 기술 스택

- **프론트엔드**: React 19 + TypeScript (strict) + Vite + React Query v5 + CSS Modules
- **FDE 백엔드**: FastAPI + PostgreSQL 15 + Python 3.11
- **디자인**: Pretendard 폰트, Tossface 이모지, Primary `#5B5FC7`

## 데이터베이스

### replica DB (읽기 전용, db-ro.butfit.io)
- 버핏서울 프로덕션 원본 데이터 복제본
- 멤버들이 자기 페이지에서 자유롭게 조회
- **쓰기 금지** — 원본 복제본이라 데이터 변경 불가

### FDE DB (EC2 로컬 PostgreSQL, 읽기/쓰기 자유)
- 공용 테이블: `page_visits`, `member_scores`, `score_history`, `login_logs`
- 멤버 자유 테이블: 필요하면 누구나 만들 수 있음
- 권장 네이밍 컨벤션: `{이름}_{테이블}` (예: `dongha_attendance`)

## 랭킹 시스템

`/fde` 페이지에 8명 멤버의 **문제해결 점수** 랭킹이 표시된다.

- **페이지 방문 트래킹**: 실시간 (라우트 변경 시 자동)
- **GitHub 지표**: 실시간 (PR/커밋 수) — ⚠️ Git config 제대로 안 하면 집계 안 됨
- **문제해결 점수**: 매일 새벽 3시 Claude 에이전트가 절대점수로 평가 (0~100)
  - 기준: 문제 난이도, 조직 임팩트, **실제 사용 여부**, 완성도, 문제 정의
  - 상대 비교 아님 — 실제로 현장의 문제를 해결했는지만 본다
  - 거창한 계획 + 미완성 + 사용자 없음 = 낮은 점수

## 기획할 때

**brainstorming 스킬을 적극 활용한다.**
"OO 기능을 만들자"보다 **"OO 기능을 기획하자"**로 시작하면
요구사항 → 디자인 → 데이터 구조 → 구현 계획까지 체계적으로 진행된다.

## 참고 문서

| 문서 | 내용 |
|------|------|
| [프로젝트 가이드/README.md](프로젝트%20가이드/README.md) | 프로젝트 개요, 멤버, 세팅 |
| [프로젝트 가이드/ARCHITECTURE.md](프로젝트%20가이드/ARCHITECTURE.md) | 시스템 아키텍처 |
| [프로젝트 가이드/DEVELOPMENT-GUIDE.md](프로젝트%20가이드/DEVELOPMENT-GUIDE.md) | 개발 가이드, 디자인 시스템 |
| [프로젝트 가이드/DATA-GUIDE.md](프로젝트%20가이드/DATA-GUIDE.md) | 데이터 구조, replica DB |
| [backend/fde/EC2_SETUP.md](backend/fde/EC2_SETUP.md) | FDE 백엔드 EC2 셋업 가이드 |

## 디자인 원칙

- 데이터가 주인공, 모바일 퍼스트, 클린 미니멀
- 안티패턴: AI 슬롭(Inter+보라 그라데이션), 느린 애니메이션, 카드 남발
- 디자인 시스템: https://fde.butfitvolt.click/fde/design-system
