# CLAUDE.md — 버핏서울 FDE 1기

**한국어 사용 필수**: 응답, 주석, 커밋 메시지 모두 한국어.

**직접 처리 우선**: gh CLI, git, 파일 수정, API 호출 등 도구로 처리 가능한 작업은 유저에게 넘기지 말고 즉시 직접 실행한다. 단, 삭제·force push 등 파괴적 작업은 확인 후 진행.

## 프로젝트 개요

버핏서울 내부의 현장 문제를 각자가 직접 코드로 해결하는 FDE(Forward Deployed Engineer) 프로그램.
9명의 멤버가 하나의 EC2 + 하나의 GitHub 레포를 공유하며, **한 팀처럼** 일한다.

- 배포 URL: https://fde.butfitvolt.click
- GitHub: https://github.com/gilrokdo1/fde-butfitvolt
- EC2: `13.209.66.148` (운영자 전용 접속, 팀원은 SSH 불필요)

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

### EC2 접속
팀원은 EC2에 직접 접속할 필요가 없다. 배포는 GitHub Actions가 자동으로 수행하고(Secret으로 보관된 PEM 사용), 코드 작업은 로컬 + PR로 끝난다.

- 로그·DB 확인이 필요하면 운영자(도길록)에게 요청
- PEM 키·EC2 시크릿은 팀원에게 공유하지 않음 (노출되면 모든 DB 비번까지 열림)

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

`/fde` 페이지에 9명 멤버의 **문제해결 점수** 랭킹이 표시된다.

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

## 최치환 구현 현황

### 유효회원 추출 (`/fde/choi-chihwan/active-members`)
- **지점별 요약 카드**: `raw_data_activeuser` 기반, 클릭하면 아래 목록/그래프 필터링
- **월별 추이 그래프**: 최근 12개월 SVG 라인 차트
- **유효회원 목록**: `raw_data_mbs` (이용상태=이용중), DISTINCT ON (user_id, place_id) — 복수 멤버십 보유 시 최고가 1건
- **CSV 다운로드**: UTF-8 BOM, 현재 선택 지점 기준

백엔드 엔드포인트 (`/fde-api/choi-chihwan/`):
- `GET /places` — 지점 목록
- `GET /branch-summary` — 지점별 유효회원 수
- `GET /monthly-trend` — 월별 추이 (최근 12개월)
- `GET /active-members` — 유효회원 상세 목록
- `GET /active-members/export.csv` — CSV 다운로드

### 경영 매뉴얼 챗봇 (`/fde/choi-chihwan/manual-chat`)
- **노션 연동**: 노션 DB(경영 표준 DB) → API로 70개 문서 읽기 → `manual_cache` 테이블에 저장
- **AI 답변**: 질문 → 관련 문서 키워드 검색 → Claude Haiku로 매뉴얼 기반 답변
- **노션 동기화 버튼**: 매뉴얼 수정 후 재동기화 가능

백엔드 엔드포인트 (`/fde-api/manual/`):
- `POST /sync` — 노션 DB 동기화
- `GET /manuals` — 저장된 매뉴얼 목록
- `POST /chat` — 챗봇 질문/답변

**필요한 EC2 환경변수** (도길록에게 요청):
- `NOTION_API_KEY` — 노션 Integration 시크릿
- `NOTION_MANUAL_DB_ID=3494dda05af58037a4a3fe31164fefe0`

**관련 파일**:
- `backend/fde/routers/choi_chihwan.py`
- `backend/fde/routers/manual_chat.py`
- `frontend/packages/erp/src/pages/ChoiChihwan/`

### 80점 경영 진단 (`/fde/choi-chihwan/branch-diagnosis`)
- **전체 현황 대시보드**: 14개 지점 카드 — 달성/진단중/미진단 구분, 달성률 프로그레스바
- **지점별 체크리스트 폼**: Biz/BX/HR/Operation 탭, 항목별 링크·비고 입력
- **147개 항목 내장**: 백엔드 템플릿에 하드코딩 (대분류 4개, 중분류 22개)
- **80점 달성 완료 버튼**: 확정 시 카드에 ✓ 달성 표시
- **백엔드 없을 때**: 지점 카드는 정상 표시, 진단 시작은 PR 머지 후 가능

DB 테이블 (`branch_diagnosis`, `diagnosis_items`):
- `branch_diagnosis` — `(id, branch_name, diagnosed_at, achieved, created_by, note)`
- `diagnosis_items` — `(id, diagnosis_id, category, sub_category, item_text, sort_order, checked, link, note)`

백엔드 엔드포인트 (`/fde-api/diagnosis/`):
- `GET /branches` — 지점 목록
- `GET /summary` — 전체 지점 최신 진단 요약
- `GET /{branch}/latest` — 지점 최신 진단 항목 전체
- `POST /{branch}/start` — 새 진단 시작 (템플릿 자동 생성)
- `PATCH /{diagnosis_id}/items` — 항목 일괄 저장
- `PATCH /{diagnosis_id}/achieve` — 80점 달성 여부 확정

**관련 파일**:
- `backend/fde/routers/branch_diagnosis.py`
- `frontend/packages/erp/src/pages/ChoiChihwan/BranchDiagnosis.tsx`
- `frontend/packages/erp/src/pages/ChoiChihwan/DiagnosisForm.tsx`

**현재 상태** (2026-04-22):
- PR #60 (`feat/choi-chihwan`) 오픈 중, 도길록 머지 대기
- 프론트엔드: 지점 카드 정상 표시, 카드 클릭 시 폼 진입
- 백엔드 연결 전: "새 진단 시작" 버튼 클릭 시 오류 안내 표시
- 머지 후 추가 작업: 도길록에게 `NOTION_API_KEY`, `NOTION_MANUAL_DB_ID` EC2 환경변수 추가 요청

## 디자인 원칙

- 데이터가 주인공, 모바일 퍼스트, 클린 미니멀
- 안티패턴: AI 슬롭(Inter+보라 그라데이션), 느린 애니메이션, 카드 남발
- **페이지 본문을 `position: fixed` + `100vw/100vh` 로 덮지 말 것** — 상단 헤더/네비가 가려져 다른 페이지로 이동 불가. iframe·풀스크린 임베드도 Layout `<Outlet />` 안에서 `width:100%; height: calc(100vh - 160px)` 로 그린다 (자세한 내용: [개발 가이드 → 페이지 영역 규칙](프로젝트%20가이드/DEVELOPMENT-GUIDE.md))
- 디자인 시스템: https://fde.butfitvolt.click/fde/design-system
