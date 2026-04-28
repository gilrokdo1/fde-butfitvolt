# 버핏서울 FDE 1기

> **F**orward **D**eployed **E**ngineer — 현장의 문제를 직접 코드로 해결하는 사람

## 이 프로젝트는 무엇인가?

팔란티어가 정의한 **FDE(Forward Deployed Engineer)** 철학을 버핏서울 내부에 적용한 프로그램입니다.
개발팀에 요청하고 기다리는 대신, **각자의 업무 현장에서 필요한 도구를 직접 기획하고 직접 만드는** 사람이 됩니다.

- **배포 URL**: https://fde.butfitvolt.click
- **GitHub**: https://github.com/gilrokdo1/fde-butfitvolt

## FDE 1기 운영 방식

**하나의 EC2 + 하나의 GitHub 레포**를 1기 전원(9명)이 공유하는 공동 놀이터입니다. 격리 없이 **한 팀처럼** 일합니다.

```
공동 자산 (전원 공유)
├── EC2 15.164.103.151     ← 운영자 전용 접속 (자동 배포로 반영)
├── GitHub 레포 하나       ← 모두 push/PR 가능
├── FDE DB (PostgreSQL)    ← 모두 테이블 생성/조회 자유
├── Replica DB (읽기 전용)  ← 버핏서울 원본 데이터
└── FDE 백엔드 (FastAPI)    ← 누구나 라우터 추가 가능

각자의 영역
└── frontend/packages/erp/src/pages/FDE/내이름/
    ├── (내가 기획한 기능 A)
    └── (내가 기획한 기능 B)
```

### 워크플로우

```
1. 내 업무에서 "이게 있으면 좋겠는데" 싶은 걸 찾는다
2. brainstorming 스킬로 AI와 함께 기획한다
3. 만든다 — 프론트+백엔드+DB 무엇이든 직접
4. ./deploy.sh 로 즉시 배포
5. 현장에서 써본다 → 피드백 → 개선 → 재배포
```

### 예전과 바뀐 점

| 이전 | 지금 |
|---|---|
| 프론트엔드만 작업 | 프론트 + 백엔드 + DB 자유 |
| 백엔드는 운영팀에 요청 | 필요한 API 직접 추가 |
| 버핏볼트 API 빌려씀 | FDE 전용 백엔드 있음 |
| — | 랭킹 시스템으로 동기부여 |

---

## 🔴 처음 시작하기 (필수 순서)

### 1. Git 사용자 설정 — 이거 안 하면 랭킹 집계 안 됨!

**GitHub이 내 커밋을 내 계정과 연결하려면 반드시 GitHub에 등록된 이메일로 설정해야 한다.**

```bash
git config --global user.email "내-GitHub-이메일"
git config --global user.name "내-GitHub-username"
```

> 이메일 확인: https://github.com/settings/emails
> 검증: `git config --global user.email` 실행 → 본인 GitHub 이메일이 나와야 함

안 하면 커밋 author가 `?`로 잡혀서 **GitHub 활동이 랭킹에 반영되지 않는다.**

### 2. 레포 클론 + 프론트엔드 의존성 설치

```bash
git clone https://github.com/gilrokdo1/fde-butfitvolt.git
cd fde-butfitvolt/frontend
pnpm install
```

사전 요구사항:
- Node.js 20+ (`brew install node`)
- pnpm 9+ (`npm install -g pnpm`)

### 3. 환경 변수 확인

`frontend/packages/erp/.env.development` (이미 레포에 존재):
```
VITE_API_URL=http://localhost:8002
```

> 로컬에 FDE 백엔드를 띄우지 않을 거면 `frontend/packages/erp/.env.development`를 `VITE_API_URL=https://fde.butfitvolt.click`로 수정 (이 파일 변경은 커밋하지 말 것).

### 4. 개발 서버 실행

```bash
cd frontend
pnpm dev:erp  # http://localhost:5173
```

### 5. 작업 → 커밋 → PR → 자동 배포

팀원은 **`./deploy.sh`를 직접 실행하지 않는다**. PR이 main에 머지되면 GitHub Actions가 자동 배포한다.

```bash
# 작업 전 동기화
git checkout main && git pull --rebase
git checkout -b feat/내기능

# 작업 후
git add -A
git commit -m "feat: 김동하 — 수업 출결 대시보드"
git push -u origin feat/내기능

# GitHub에서 PR 생성 → 머지 → 자동 배포 (Slack 알림 옴)
```

> `./deploy.sh`는 운영자(도길록) 로컬에서만 쓰는 비상용 수동 배포 스크립트.

### 6. EC2 접속

팀원은 EC2에 직접 접속할 필요가 없다. 배포는 GitHub Actions가 자동으로 수행하고, 코드 작업은 로컬 + PR로 끝난다. 로그·DB 확인이 필요하면 운영자에게 요청한다.

PEM 키는 GitHub Secrets(`EC2_SSH_KEY`)에만 존재하며 팀원에게 배포하지 않는다.

---

## 1기 멤버

| | 이름 | 팀 | 슬랙 사진 |
|---|------|-----|----------|
| 0 | **도길록** | DX기획팀 | ![도길록](https://avatars.slack-edge.com/2025-01-23/8322354937335_ae38ae59e03ad68109c5_192.jpg) |
| 1 | **김동하** | BG영업기획팀 | ![김동하](https://avatars.slack-edge.com/2025-07-13/9188618018178_924a00d486ce8b1d9760_192.jpg) |
| 2 | **김소연** | TB운영실 | ![김소연](https://avatars.slack-edge.com/2019-08-05/716125194373_fdeb89064ed323c13836_192.jpg) |
| 3 | **김영신** | 피플팀 | ![김영신](https://avatars.slack-edge.com/2025-09-29/9604361354356_e3267eb003286226f52b_192.jpg) |
| 4 | **박민규** | TB SV | ![박민규](https://avatars.slack-edge.com/2026-03-03/10649171595712_2e1fcdf4fe46dd9c391f_192.jpg) |
| 5 | **이예원** | BG운영지원팀 | ![이예원](https://avatars.slack-edge.com/2024-07-29/7491135991875_45cd9161e243bc1f6dfe_192.jpg) |
| 6 | **정석환** | BG 신도림·가산 | ![정석환](https://ca.slack-edge.com/T3ZS68V1R-U06FS0EKMPG-9eac208f0783-512) |
| 7 | **최지희** | 재무기획실 | ![최지희](https://avatars.slack-edge.com/2025-04-14/8746410027429_b0b7831a5031e48c6d0f_192.png) |
| 8 | **최치환** | BG SV | ![최치환](https://avatars.slack-edge.com/2024-10-01/7812698097300_4bb76c46a529999c1763_192.png) |

---

## 랭킹 시스템 (`/fde` 페이지)

9명 멤버의 성과를 3가지 지표로 지표화합니다:

| 지표 | 주기 | 설명 |
|---|---|---|
| **페이지 방문수** | 실시간 | 내 페이지에 다른 사람들이 얼마나 방문하는가 |
| **GitHub 활동** | 실시간 | PR 수, 커밋 수 (GitHub username 매핑 필요) |
| **문제해결 점수** | 매일 3시 | Claude 에이전트가 절대점수로 평가 (0~100) |

**문제해결 점수 기준** — 상대 비교 아님:
- 문제의 난이도 (쉬운 문제 vs 조직의 근본 문제)
- 조직 임팩트 (실제 현장에 변화를 줬는가)
- 실제 사용 여부 (만들어놓고 아무도 안 쓰면 낮은 점수)
- 완성도 (계획만 거창하고 구현 미완이면 낮은 점수)
- 문제 정의 (문제를 제대로 파악하고 접근했는가)

> ⚠️ Git config 설정 제대로 안 하면 GitHub 지표가 `?`로 잡혀 집계 안 됨.

---

## 시스템 구성

```
https://fde.butfitvolt.click
    ↓ (Nginx, EC2 15.164.103.151)
    ├── /           → React 프론트엔드 (/var/www/erp)
    └── /fde-api/*  → FDE FastAPI (포트 8002, systemd: fde-backend)
                         ↓
                         ├── FDE DB: 방문/랭킹/점수/멤버 자유 테이블
                         ├── Replica DB (db-ro.butfit.io, 읽기 전용)
                         ├── GitHub API: PR/커밋 지표
                         └── api.butfit.io: 로그인 (→ FDE JWT)
```

---

## 문서 구성

| 문서 | 내용 |
|------|------|
| **이 파일 (README.md)** | 프로젝트 개요, 세팅, 멤버 |
| [GITHUB-GUIDE.md](./GITHUB-GUIDE.md) | **GitHub 협업 가이드** — 처음 쓰는 사람 대상, 설치부터 PR까지 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 시스템 아키텍처, 메뉴 구조, FDE 백엔드 |
| [DEVELOPMENT-GUIDE.md](./DEVELOPMENT-GUIDE.md) | 프론트엔드 개발 가이드, 디자인 시스템 |
| [DATA-GUIDE.md](./DATA-GUIDE.md) | Replica DB 구조, 스냅샷 |
| [../backend/fde/EC2_SETUP.md](../backend/fde/EC2_SETUP.md) | FDE 백엔드 EC2 셋업 |
| [../CLAUDE.md](../CLAUDE.md) | AI 에이전트 가이드 |

---

## 기술 스택

```
Frontend    : React 19 + TypeScript (strict) + Vite + React Query v5 + CSS Modules
FDE Backend : FastAPI (Python 3.11) + PostgreSQL 15
Deploy      : 직접 배포 (./deploy.sh) — EC2 + Nginx
Auth        : butfit.io API 검증 → FDE 자체 JWT 발급 (HS256, 24시간)
```

---

## 디렉토리 구조

```
05_버핏서울_FDE_1기/
├── backend/fde/              # FDE 전용 백엔드 (FastAPI)
│   ├── main.py
│   ├── routers/              # auth, tracking, ranking, github
│   ├── utils/
│   ├── jobs/evaluate.py      # 문제해결 점수 평가 (크론잡)
│   ├── schema.sql
│   └── EC2_SETUP.md
├── frontend/                 # React 모노레포 (pnpm workspace)
│   └── packages/erp/
│       ├── src/pages/FDE/내이름/   ← 각자 작업 공간
│       ├── src/api/fde.ts         ← FDE 백엔드 API 호출
│       └── ...
├── 프로젝트 가이드/          # 문서
├── deploy.sh                 # ./deploy.sh erp / ./deploy.sh fde-backend
├── .env                      # 환경변수 (Git 추적 X)
├── BUTFITSEOUL_FDE1.pem      # EC2 SSH 키 (운영자 로컬에만, Git 추적 X, 팀원 배포 금지)
└── CLAUDE.md                 # AI 에이전트 가이드
```

---

## 도메인 용어 사전

### 회원 관련

| 용어 | 설명 |
|------|------|
| **유효회원** | 특정 시점에 유효한 멤버십을 보유한 회원. `begin_date <= 조회일 AND end_date >= 조회일` |
| **신규회원** | 해당 카테고리 또는 전체 이력에서 첫 번째 멤버십을 구매한 회원 (회차=1) |
| **기존회원** | 재등록 회원 (회차>1) |
| **휴면회원** | 멤버십 만료 후 장기간 미등록 상태 |
| **법인회원** | 법인 계약으로 등록된 회원 (category_depth2='법인회원') |
| **패스 (Pass)** | 회원과 지점을 연결하는 엔티티. 멤버십의 부모 |

### 멤버십 관련

| 용어 | 설명 |
|------|------|
| **멤버십** | 회원이 구매한 상품 단위. 1결제 = 1멤버십 |
| **기간권** | 시작일~종료일 기반 멤버십 (피트니스, 팀버핏) |
| **구독** | 월 자동결제 멤버십 (subscription) |
| **체험** | 체험용 단기 멤버십 (크레딧 < 400 또는 상품명 '체험') |
| **정규** | 정식 멤버십 (체험이 아닌 것) |
| **크레딧** | 이용 횟수 단위. 100 크레딧 = 1회. 99999+ = 무제한 |
| **회차** | 해당 회원의 몇 번째 멤버십인지 (lt_신규, cat_신규 등) |
| **이용상태** | 이용중/만료/휴회/환불/휴면 등 현재 상태 |

### PT 관련

| 용어 | 설명 |
|------|------|
| **PT** | Personal Training. 1:1 개인 트레이닝 |
| **체험전환** | 체험 PT 후 정규 PT를 구매한 것 |
| **미전환** | 체험만 받고 정규 구매하지 않은 것 |
| **재등록** | 정규 PT 종료 후 30일 이내 재구매 |
| **담당트레이너** | 멤버십에 배정된 PT 트레이너 (ACTIVE 상태) |
| **대관** | 트레이너가 공간만 빌려 자체 PT를 진행하는 것 |

### 수업 관련

| 용어 | 설명 |
|------|------|
| **세션 (Session)** | 수업 1회. 날짜 + 시간 + 트레이너 |
| **클래스 (Class)** | 세션의 반복 틀 (매주 수요일 10시 요가 등) |
| **프로그램 (Program)** | 수업 종류 (PT, 요가, 팀버핏 등) |
| **팀버핏** | 버핏서울의 그룹 운동 프로그램 |
| **당일취소** | 수업 당일에 취소한 것 (별도 집계) |

### 결제/매출 관련

| 용어 | 설명 |
|------|------|
| **현금주의** | 돈이 들어온 날 = 매출 인식일 |
| **발생주의** | 계약 기간에 걸쳐 월별 균등 분배 |
| **매출카테고리** | 안심결제/대관/환불/1일권/법인/체험/정규/기타 등 |
| **양도** | 멤버십을 다른 회원에게 이전 |
| **inVat / exVat** | 부가세 포함/제외 금액 (exVat = inVat / 1.1) |

### 운영 관련

| 용어 | 설명 |
|------|------|
| **지점 (Place)** | 피트니스 센터 위치 |
| **오피스** | 본사 (전체 지점 데이터 접근 가능) |
| **카디오** | 유산소 운동 기구 (러닝머신, 자전거 등) |
| **VOC** | Voice of Customer. 고객 의견/불만 |
| **플레이트** | 버핏서울 자체 포인트 시스템 |

### 시스템 관련

| 용어 | 설명 |
|------|------|
| **Replica DB** | 버핏서울 원본 DB의 읽기 전용 복제본 (`db-ro.butfit.io`) |
| **FDE DB** | FDE 전용 PostgreSQL. EC2 로컬에 있음. 자유롭게 쓰기 가능 |
| **FDE 백엔드** | FDE 전용 FastAPI 서버. 포트 8002 |
| **스냅샷** | 레플리카 원본을 분석용으로 비정규화한 테이블 (raw_data_*) |
