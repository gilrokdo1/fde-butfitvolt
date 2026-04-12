# 시스템 아키텍처

## 전체 구조

```
                    ┌─────────────────────────────┐
                    │         Nginx (리버스 프록시)  │
                    │   SSL 종료 + 서브도메인 라우팅  │
                    └──────┬──────────────────┬────┘
                           │                  │
              ┌────────────▼──────┐    ┌──────▼─────────────┐
              │   Static Files    │    │   FastAPI Backend   │
              │  (5개 SPA 앱)     │    │   (단일 인스턴스)    │
              │                   │    │   Port 8000/8001    │
              │  butfitvolt.click │    │                     │
              │  bs.butfitvolt..  │    │   /api/*            │
              │  partner.butfit.. │    │                     │
              │  pt.butfitvolt..  │    └──────┬──────────────┘
              │  b2b.butfitvolt.. │           │
              └───────────────────┘    ┌──────▼──────────────┐
                                       │   PostgreSQL (2개)   │
                                       │                     │
                                       │  butfitvolt (자체)   │
                                       │  replica (원본복제)  │
                                       └─────────────────────┘
```

---

## 멀티앱 구조

하나의 코드베이스(모노레포)에서 **5개 독립 앱**을 관리합니다.

| 앱 | 패키지명 | 서브도메인 | 포트 | 대상 사용자 |
|----|---------|-----------|------|-----------|
| **ERP** | `@butfitvolt/erp` | `butfitvolt.click` | 5173 | 본사 관리자 |
| **버핏서울 (BS)** | `@butfitvolt/bs` | `bs.butfitvolt.click` | 5174 | 임직원 |
| **파트너센터** | `@butfitvolt/partner` | `partner.butfitvolt.click` | 5175 | 외부 파트너사 |
| **트레이너 (PT)** | `@butfitvolt/pt` | `pt.butfitvolt.click` | 5176 | PT 트레이너 |
| **B2B** | `@butfitvolt/b2b` | `b2b.butfitvolt.click` | 5177 | 법인 고객 |

### 앱 간 격리 원칙

1. JWT의 `app_type` 클레임으로 백엔드에서 앱별 권한 격리
2. localStorage 키 격리: erp=`token`, bs=`bs_token`, partner=`partner_token` ...
3. 각 앱은 독립 빌드 → 독립 배포 경로
4. 공유 코드는 `@butfitvolt/shared` 패키지로 관리

---

## FDE 1기 — 멤버별 메뉴 구조

FDE 프로젝트에서는 ERP 앱의 **사이드바 대메뉴**에 각 멤버의 이름과 슬랙 프로필 사진이 표시됩니다.

```
사이드바 (ERP)
│
├── 🏠 홈
│
├── 👤 김동하 (BG영업기획팀)
│   ├── [서브메뉴] 내가 만든 기능 A
│   └── [서브메뉴] 내가 만든 기능 B
│
├── 👤 김소연 (TB운영실)
│   └── [서브메뉴] ...
│
├── 👤 김영신 (피플팀)
│   └── [서브메뉴] ...
│
├── 👤 박민규 (TB SV)
│   └── [서브메뉴] ...
│
├── 👤 이예원 (BG운영지원팀)
│   └── [서브메뉴] ...
│
├── 👤 최재은 (DX기획팀)
│   └── [서브메뉴] ...
│
├── 👤 최지희 (재무기획실)
│   └── [서브메뉴] ...
│
└── 👤 최치환 (BG SV)
    └── [서브메뉴] ...
```

### 슬랙 사진 연동

각 멤버의 프로필 사진은 `user_employee.slack_image_url` 컬럼에서 가져옵니다.

| 이름 | 슬랙 사진 URL |
|------|-------------|
| 김동하 | `https://avatars.slack-edge.com/2025-07-13/9188618018178_924a00d486ce8b1d9760_192.jpg` |
| 김소연 | `https://avatars.slack-edge.com/2019-08-05/716125194373_fdeb89064ed323c13836_192.jpg` |
| 김영신 | `https://avatars.slack-edge.com/2025-09-29/9604361354356_e3267eb003286226f52b_192.jpg` |
| 박민규 | `https://avatars.slack-edge.com/2026-03-03/10649171595712_2e1fcdf4fe46dd9c391f_192.jpg` |
| 이예원 | `https://avatars.slack-edge.com/2024-07-29/7491135991875_45cd9161e243bc1f6dfe_192.jpg` |
| 최재은 | `https://avatars.slack-edge.com/2026-01-05/10214058599879_627b313ca5489eee3a5d_192.png` |
| 최지희 | `https://avatars.slack-edge.com/2025-04-14/8746410027429_b0b7831a5031e48c6d0f_192.png` |
| 최치환 | `https://avatars.slack-edge.com/2024-10-01/7812698097300_4bb76c46a529999c1763_192.png` |

### 프론트엔드 라우팅 구조

```
/fde/kim-dongha/*        → 김동하 페이지들
/fde/kim-soyeon/*        → 김소연 페이지들
/fde/kim-youngshin/*     → 김영신 페이지들
/fde/park-mingyu/*       → 박민규 페이지들
/fde/lee-yewon/*         → 이예원 페이지들
/fde/choi-jaeeun/*       → 최재은 페이지들
/fde/choi-jihee/*        → 최지희 페이지들
/fde/choi-chihwan/*      → 최치환 페이지들
```

### 백엔드 API

FDE에서 필요한 API는 운영팀에 요청하면 생성해줍니다.
기존 API(`/api/ground/*`, `/api/dashboard/*` 등)도 프론트에서 자유롭게 호출할 수 있습니다.

---

## 모노레포 구조

```
frontend/
├── package.json            # workspace 루트 (pnpm)
├── pnpm-workspace.yaml     # workspace 선언
├── pnpm-lock.yaml          # 의존성 lock
└── packages/
    ├── erp/                # ERP 앱 (FDE 주 작업 대상)
    │   ├── src/
    │   │   ├── api/        # API 클라이언트 (axios)
    │   │   ├── components/ # UI 컴포넌트
    │   │   ├── pages/      # 라우트별 페이지
    │   │   │   └── FDE/    # ← FDE 멤버별 페이지 디렉토리
    │   │   │       ├── KimDongha/
    │   │   │       ├── KimSoyeon/
    │   │   │       ├── KimYoungshin/
    │   │   │       ├── ParkMingyu/
    │   │   │       ├── LeeYewon/
    │   │   │       ├── ChoiJaeeun/
    │   │   │       ├── ChoiJihee/
    │   │   │       └── ChoiChihwan/
    │   │   ├── contexts/   # React Context (Auth, Chat)
    │   │   ├── hooks/      # 커스텀 훅
    │   │   ├── services/   # 비즈니스 로직
    │   │   ├── types/      # TypeScript 타입
    │   │   └── config/     # 메뉴 설정
    │   └── vite.config.ts
    │
    ├── bs/                 # 버핏서울 앱
    ├── partner/            # 파트너센터 앱
    ├── pt/                 # 트레이너 앱
    ├── b2b/                # B2B 앱
    └── shared/             # 공유 패키지
```

---

## 백엔드 구조

```
backend/
├── main.py                 # FastAPI 앱 진입점 + 스케줄러
├── requirements.txt        # Python 의존성
├── routers/                # API 라우터 (운영팀 관리, FDE 멤버는 수정 X)
│   ├── auth.py             # 인증 (JWT 로그인/토큰)
│   ├── admin.py            # 관리자 권한
│   ├── dashboard.py        # 대시보드 통계
│   ├── ground.py           # 운영 관리
│   ├── finance.py          # 재무 관리
│   ├── pt.py               # PT 관리
│   └── people.py           # 인사 관리
├── services/               # 비즈니스 로직
├── utils/                  # 공유 유틸리티
│   ├── db.py               # DB 컨텍스트 매니저
│   ├── auth.py             # JWT 검증
│   └── dependencies.py     # FastAPI DI
├── migrations/             # SQL 마이그레이션
└── tools/                  # AI 에이전트 도구
```

---

## 데이터베이스 2계층 구조

```
┌────────────────────���───────────┐     ┌────────────────────────────────┐
│      Butfitvolt DB (자체)       │     │      Replica DB (복제본)        │
│                                │     │                                │
│  용도: 앱 전용 데이터            │     │  용도: 버핏서울 원본 데이터       │
│  연결: safe_db('butfitvolt')    │     │  연결: safe_db('replica')       │
│                                │     │                                │
│  - users (앱 사용자)            │     │  - user_user (회원)             │
│  - finance_* (재무)            │     │  - b_class_bmembership (멤버십)  │
│  - wiki_* (위키)               │     │  - b_payment_* (결제)           │
│  - agent_* (AI 대화)           │     │  - b_class_bsession (수업)      │
│  - bstore_order_* (발주)       │     │  - raw_data_* (스냅샷 10개)     │
└────────────────────────────────┘     └────────────────────────────────┘
```

### DB 연결 패턴

```python
from utils.db import safe_db

# 앱 전용 DB
with safe_db('butfitvolt') as (conn, cursor):
    cursor.execute("SELECT * FROM users WHERE ...")

# 레플리카 DB (기본값)
with safe_db('replica') as (conn, cursor):
    cursor.execute("SELECT * FROM raw_data_activeuser WHERE ...")
```

---

## 인증 흐름

```
사용자 로그인 → POST /api/auth/login { username, password, app_type }
                    │
                    ▼
             JWT 토큰 발급 (app_type 클레임 포함)
                    │
                    ▼
          localStorage에 저장 (앱별 다른 키)
                    │
                    ▼
          API 요청 시 Authorization: Bearer <token>
                    │
                    ▼
          백엔드 Depends(get_current_user) → JWT 디코딩 + 권한 체크
```

---

## 배포 (Blue-Green)

```
현재 포트 확인 → 반대 포트에 새 서버 기동 → 헬스체크 → Nginx 포트 전환 → 이전 서버 종료

예: 현재 8000 → 새 서버 8001 기동 → OK → Nginx → 8001 → 8000 종료
```

```bash
./deploy.sh              # 전체 배포
./deploy.sh frontend     # 프론트엔드만
./deploy.sh erp          # ERP 앱만
./deploy.sh backend      # 백엔드만
```

> 배포 락이 1분 있으므로, 다른 멤버가 배포 중이면 자동으로 대기됩니다.

---

## 스케줄러 (백그라운드 작업)

main.py에 APScheduler로 등록된 주기 작업:

| 작업 | 주기 | 역할 |
|------|------|------|
| 카디오 장비 상태 로깅 | 매시 정각 | Firebase → DB |
| 문제 기기 자동 리셋 | 매시 정각+10분 | 4시간 쿨타임 |
| Slack 장비 알림 | 매일 14:00 | 이상 감지 → Slack |
| Typeform 폴링 | 1분 간격 | 새 설문 응답 수집 |
| 고위드 동기화 | 10분 간격 | 급여시스템 동기화 |
