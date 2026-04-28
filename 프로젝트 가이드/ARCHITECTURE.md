# 시스템 아키텍처

## 전체 구조

```
                 https://fde.butfitvolt.click
                           │
                    ┌──────▼──────────────────────┐
                    │         Nginx (EC2)          │
                    │   SSL + 경로 분기             │
                    └──┬──────────────────────┬────┘
                       │                      │
              ┌────────▼─────────┐    ┌───────▼────────────┐
              │  /               │    │  /fde-api/*        │
              │  React SPA       │    │  FDE FastAPI       │
              │  /var/www/erp    │    │  Port 8002         │
              └──────────────────┘    │  systemd 관리      │
                                      └───────┬────────────┘
                                              │
          ┌───────────────────────────────────┼──────────────────────┐
          │                     │             │                      │
  ┌───────▼──────┐   ┌──────────▼────────┐   ┌▼──────────┐   ┌──────▼──────┐
  │  FDE DB      │   │  Replica DB       │   │ GitHub    │   │ api.butfit  │
  │  (EC2 local) │   │  (db-ro.butfit.io)│   │ API       │   │ .io         │
  │  읽기/쓰기   │   │  읽기 전용         │   │ 지표 수집  │   │ 로그인 검증 │
  │              │   │                   │   │           │   │             │
  │ page_visits  │   │ user_user         │   │ PR, 커밋  │   │ (FDE JWT로  │
  │ member_scores│   │ b_class_*         │   │           │   │  변환)      │
  │ 멤버 자유 테이블│   │ raw_data_*        │   │           │   │             │
  └──────────────┘   └───────────────────┘   └───────────┘   └─────────────┘
```

## 배포 환경

- **EC2**: `15.164.103.151` (Amazon Linux 2023)
- **도메인**: `fde.butfitvolt.click` (Let's Encrypt SSL)
- **Nginx**: 경로 기반 라우팅 (`/` → 정적, `/fde-api/` → 8002)
- **systemd 서비스**: `fde-backend.service` (자동 재시작)
- **PostgreSQL 15**: EC2 로컬 실행
- **cron**: 매일 03:00 문제해결 점수 평가 실행

## FDE 백엔드 (FastAPI)

### 폴더 구조

```
backend/fde/
├── main.py              # FastAPI 앱, CORS, 인증 미들웨어
├── routers/
│   ├── auth.py          # POST /login, GET /me
│   ├── tracking.py      # 방문 기록/통계
│   ├── ranking.py       # 랭킹 조회, 멤버 상세
│   └── github.py        # GitHub PR/커밋 지표 (5분 캐시)
├── utils/
│   ├── auth.py          # JWT 발급/검증 (HS256, 24시간)
│   └── db.py            # FDE DB + replica DB 연결
├── jobs/
│   └── evaluate.py      # Claude API로 문제해결 점수 평가
├── schema.sql
├── requirements.txt
├── .env                 # Git 추적 X
└── EC2_SETUP.md
```

### API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/fde-api/auth/login` | ❌ | butfit.io 검증 → FDE JWT 발급 |
| GET | `/fde-api/auth/me` | ✅ | 현재 사용자 정보 |
| POST | `/fde-api/tracking/visit` | ✅ | 페이지 방문 기록 |
| GET | `/fde-api/tracking/stats` | ✅ | 멤버별 방문 통계 |
| GET | `/fde-api/ranking` | ✅ | 전체 랭킹 (점수 순) |
| GET | `/fde-api/ranking/{member_name}` | ✅ | 멤버 상세 |
| GET | `/fde-api/github/stats` | ✅ | GitHub 지표 요약 |
| GET | `/fde-api/github/{member_name}` | ✅ | 멤버 GitHub 상세 |
| POST | `/fde-api/evaluate/run` | ✅ | 수동 평가 트리거 |
| GET | `/fde-api/health` | ❌ | 헬스체크 |

## 인증 흐름

```
사용자 로그인
    │
    ▼
POST /fde-api/auth/login { phone_number, password }
    │
    ▼
FDE 백엔드가 api.butfit.io/user/token/ 호출 (비밀번호 검증)
    │
    ▼
버핏서울 토큰에서 user_id 추출
    │
    ▼
api.butfit.io/api/user/{user_id}/ → 이름, 사진 등 조회
    │
    ▼
FDE 자체 JWT 발급 (HS256, 24시간)
    │
    ▼
프론트엔드 localStorage('auth_token') 저장
    │
    ▼
이후 요청: Authorization: Bearer <token>
    │
    ▼
FDE 백엔드 미들웨어가 JWT 검증 후 request.state.user 주입
```

## 데이터베이스

### FDE DB (EC2 local PostgreSQL 15)

읽기/쓰기 자유. 멤버들이 필요하면 테이블을 자유롭게 추가.

**공용 테이블:**

```sql
page_visits      -- 페이지 방문 기록 (실시간)
member_scores    -- 멤버별 랭킹 점수
score_history    -- 점수 히스토리
login_logs       -- 로그인 기록
```

**멤버 자유 테이블:**
- 네이밍 권장: `{이름}_{테이블}` (예: `dongha_attendance`)
- 제한 없음

### Replica DB (db-ro.butfit.io)

버핏서울 프로덕션 원본의 읽기 전용 복제본. 멤버들이 자기 페이지에서 버핏서울 데이터를 조회할 때 사용.

주요 테이블: `user_user`, `b_class_bmembership`, `b_payment_*`, `b_class_bsession`, `raw_data_*` 등.
자세한 구조는 [DATA-GUIDE.md](./DATA-GUIDE.md) 참조.

### DB 연결 패턴 (FDE 백엔드 내부)

```python
from utils.db import safe_db

# FDE DB
with safe_db("fde") as (conn, cursor):
    cursor.execute("SELECT * FROM member_scores")

# Replica DB (읽기 전용)
with safe_db("replica") as (conn, cursor):
    cursor.execute("SELECT * FROM raw_data_activeuser WHERE ...")
```

## 프론트엔드 — 멤버별 메뉴 구조

```
사이드바 (ERP)
│
├── 🏠 홈 (FDE 소개)
│
├── 📊 FDE 1기 (/fde) ← 랭킹 대시보드
│   └── 디자인 시스템 (/fde/design-system)
│
├── 👤 김동하 (BG영업기획팀)
│   └── [서브메뉴] 내가 만든 기능들
├── 👤 김소연 (TB운영실)
│   └── ...
├── 👤 김영신 (피플팀)
├── 👤 박민규 (TB SV)
├── 👤 이예원 (BG운영지원팀)
├── 👤 최지희 (재무기획실)
└── 👤 최치환 (BG SV)
```

### 슬랙 프로필 사진

각 멤버의 메뉴 아이콘은 슬랙 프로필 사진을 사용. URL은 `menuConfig.ts`에 하드코딩.

### 프론트엔드 라우팅

```
/                         → 홈 (FDE 소개)
/fde                      → 랭킹 대시보드 (9명 점수 순)
/fde/design-system        → 디자인 시스템 레퍼런스
/fde/do-gilrok/*          → 도길록 페이지들
/fde/kim-dongha/*         → 김동하 페이지들
/fde/kim-soyeon/*         → 김소연 페이지들
/fde/kim-youngshin/*      → 김영신 페이지들
/fde/park-mingyu/*        → 박민규 페이지들
/fde/lee-yewon/*          → 이예원 페이지들
/fde/jung-seokhwan/*      → 정석환 페이지들
/fde/choi-jihee/*         → 최지희 페이지들
/fde/choi-chihwan/*       → 최치환 페이지들
```

## 랭킹 시스템

### 지표 3가지

| 지표 | 주기 | 출처 |
|---|---|---|
| 페이지 방문수 | 실시간 | FDE DB (`page_visits`) — 프론트가 라우트 변경 시 자동 POST |
| GitHub 지표 | 실시간 (5분 캐시) | GitHub API (`gilrokdo1/fde-butfitvolt`) |
| 문제해결 점수 | 매일 03:00 | Claude API (`claude-sonnet-4-20250514`) |

### 문제해결 점수 평가 프로세스

```
crontab → python -m jobs.evaluate
    │
    ▼
입력 수집:
  - GitHub PR/커밋 목록
  - 페이지 방문 데이터
  - 이전 평가 점수 (히스토리)
    │
    ▼
Claude API 호출 (각 멤버에 대한 절대점수 0~100)
    │
    ▼
평가 기준:
  - 문제의 난이도
  - 조직 임팩트
  - 실제 사용 여부 (방문수)
  - 완성도
  - 문제 정의
    │
    ▼
member_scores 업데이트 + score_history 추가
```

### 중요: GitHub 계정 매핑

GitHub 지표는 **커밋 author의 GitHub username**으로 집계.

멤버가 로컬에서 `git config --global user.email`을 **GitHub에 등록된 이메일**로 설정해야 커밋이 본인 계정에 연결된다.

`member_scores` 테이블의 `github_username` 컬럼에 각 멤버의 GitHub username을 입력해야 집계가 동작.

## 모노레포 구조

```
frontend/
├── package.json           # workspace 루트 (pnpm)
├── pnpm-workspace.yaml
└── packages/
    ├── erp/               # 이 프로젝트의 주 작업 대상
    │   ├── src/
    │   │   ├── api/
    │   │   │   ├── client.ts       # axios 인스턴스 + JWT 자동 첨부
    │   │   │   └── fde.ts          # FDE 백엔드 API 함수
    │   │   ├── components/
    │   │   ├── pages/
    │   │   │   ├── Home/           # FDE 소개 홈
    │   │   │   ├── FDE1/           # /fde 랭킹 대시보드
    │   │   │   └── FDE/            # ← 멤버별 페이지
    │   │   │       ├── KimDongha/
    │   │   │       ├── KimSoyeon/
    │   │   │       └── ...
    │   │   ├── contexts/
    │   │   │   └── AuthContext.tsx  # FDE JWT 관리
    │   │   └── config/
    │   │       └── menuConfig.ts    # 사이드바 메뉴
    │   └── vite.config.ts
    │
    ├── bs/, partner/, pt/, b2b/   # 사용 안 함 (레거시, 무시)
    └── shared/                     # 공유 타입
```

> `bs/`, `partner/`, `pt/`, `b2b/` 패키지는 예전 버핏볼트 구조의 잔재다. FDE 프로젝트에서는 **ERP 앱만 사용**한다.

## 배포

### 프론트엔드

```bash
./deploy.sh erp
```

1. 로컬에서 빌드 (`pnpm build:erp`)
2. `dist/` → EC2 `~/fde1/frontend-erp/` 로 rsync
3. EC2에서 `/var/www/erp/` 로 교체 (sudo)

무중단 배포 — Nginx가 정적 파일을 서빙하므로 교체 순간만 잠깐의 404.

### FDE 백엔드

```bash
./deploy.sh fde-backend
```

1. `backend/fde/` → EC2 `~/fde1/fde-backend/` 로 rsync (`.env`, `__pycache__` 제외)
2. `pip install -r requirements.txt` (의존성 변경 시만 실제 변경)
3. `sudo systemctl restart fde-backend`

재시작 시 수 초의 다운타임 있음.

### 배포 락

`deploy.sh`는 `/tmp/fde1.deploy.lock` 파일로 1분 락. 다른 멤버가 배포 중이면 자동 대기.
