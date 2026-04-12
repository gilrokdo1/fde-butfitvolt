# FDE 랭킹 대시보드 + FDE 백엔드 인프라 설계

## 개요

FDE 1기 멤버들의 성과를 지표화하고 랭킹으로 보여주는 시스템.
멤버 동기부여 + 운영팀 모니터링이 핵심 목적이며, 외부 홍보 가치도 고려한다.

**URL**: `https://fde.butfitvolt.click/fde`

## 서브 프로젝트 구분

이 스펙은 2개의 서브 프로젝트를 포함한다:

1. **FDE 백엔드 인프라** — FastAPI 서버 + FDE DB + replica 연결 + 인증
2. **FDE 랭킹 대시보드** — 방문 트래킹 + GitHub 지표 + 문제해결 점수 + 프론트엔드 UI

---

## 1. 시스템 아키텍처

```
[브라우저] → fde.butfitvolt.click
    ↓
[Nginx] → /fde-api/* → FDE FastAPI (포트 8002)
        → /fde/*     → FDE 프론트엔드 (기존)
    ↓
[FDE FastAPI]
    ├── 인증: api.butfit.io → 비밀번호 검증
    ├── replica DB (읽기 전용) → 프로덕션 데이터 조회
    ├── FDE DB (읽기/쓰기) → 트래킹, 랭킹, 멤버 자유 테이블
    └── GitHub API → 활동 지표 수집

[크론잡 - 하루 1회]
    └── Claude API → 모든 데이터 종합 → 문제해결 점수 평가 → FDE DB 저장
```

### 프로젝트 폴더 구조

```
05_버핏서울_FDE_1기/
├── frontend/              # 기존 프론트엔드
├── backend/fde/           # FDE 전용 백엔드 (신규)
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py        # 로그인 (butfit.io + replica)
│   │   ├── tracking.py    # 방문 트래킹
│   │   ├── ranking.py     # 랭킹/점수 API
│   │   └── github.py      # GitHub 지표
│   ├── utils/
│   │   ├── auth.py        # JWT 발급/검증
│   │   └── db.py          # DB 연결 (replica + FDE DB)
│   ├── jobs/
│   │   └── evaluate.py    # 문제해결 점수 평가 크론잡
│   ├── requirements.txt
│   └── .env
└── deploy.sh              # FDE 백엔드 배포 추가
```

### 인프라 결정사항

- 같은 EC2에 별도 포트(8002)로 FDE FastAPI 실행
- Nginx에서 `/fde-api/*` → 8002로 리버스 프록시
- 멤버 전원 PEM 키 공유 → SSH 접속, 배포 가능
- 멤버들은 백엔드 코드, DB 테이블, API 라우터 모두 자유롭게 추가 가능

---

## 2. 인증

### 로그인 흐름

1. 프론트에서 `POST /fde-api/auth/login` (phone_number, password)
2. FDE 백엔드 → `https://api.butfit.io/user/token/` 호출 → 비밀번호 검증
3. 버핏서울 토큰에서 user_id 추출 (Base64 디코딩)
4. `https://api.butfit.io/api/user/{user_id}/` → 사용자 정보 (이름, 사진 등)
5. FDE 자체 JWT 발급 (24시간, HS256)
6. FDE DB `login_logs` 테이블에 로그인 기록 저장

### 버핏볼트 대비 제거하는 것

- 앱 타입별 권한 분기 (ERP/BS/PT/Partner/B2B) — FDE는 하나의 앱
- user_employee, user_bplacemanager 권한 체크 — 로그인만 되면 OK
- Origin 기반 앱 타입 검증 미들웨어
- 권한 캐싱 — 불필요

### `/fde-api/auth/me`

- JWT에서 user_id 추출 → 사용자 정보 반환
- 새로고침 시 세션 유지 용도

### 프론트엔드 변경

- `.env`의 `VITE_API_URL`을 FDE 백엔드 URL로 변경
- AuthContext.tsx는 거의 그대로 유지 (응답 구조만 맞춤)

---

## 3. DB 구조

### 연결 대상

| DB | 용도 | 접근 |
|---|---|---|
| replica DB (`db-ro.butfit.io`) | 버핏서울 프로덕션 데이터 읽기 전용 | 멤버 페이지에서 활용 |
| FDE DB (새로 생성) | 트래킹, 랭킹, 멤버 자유 테이블 | 읽기/쓰기 |

butfitvolt DB는 이 프로젝트와 관계 없음.

### FDE DB 공용 테이블

```sql
-- 페이지 방문 트래킹 (실시간)
CREATE TABLE page_visits (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  user_name VARCHAR(50),
  page_path VARCHAR(255),
  visited_at TIMESTAMP DEFAULT NOW()
);

-- 멤버 랭킹/점수 (하루 1회 에이전트가 업데이트)
CREATE TABLE member_scores (
  id SERIAL PRIMARY KEY,
  member_name VARCHAR(50),
  github_username VARCHAR(50),
  problem_score DECIMAL(5,1),
  score_reason TEXT,
  github_stats JSONB,
  visit_count INT DEFAULT 0,
  evaluated_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 점수 히스토리 (변화 추이용)
CREATE TABLE score_history (
  id SERIAL PRIMARY KEY,
  member_name VARCHAR(50),
  problem_score DECIMAL(5,1),
  score_reason TEXT,
  evaluated_at TIMESTAMP DEFAULT NOW()
);

-- 로그인 기록
CREATE TABLE login_logs (
  id SERIAL PRIMARY KEY,
  user_id INT,
  user_name VARCHAR(50),
  action_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 멤버 자유 테이블

- 제한 없음 — 멤버가 자기 기능에 필요한 테이블을 자유롭게 생성
- 권장 네이밍 컨벤션: `{이름}_{테이블명}` (예: `dongha_customers`)

---

## 4. API 엔드포인트

### 인증

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/fde-api/auth/login` | 로그인 (butfit.io 인증 → FDE JWT 발급) |
| GET | `/fde-api/auth/me` | 현재 사용자 정보 |

### 방문 트래킹 (실시간)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/fde-api/tracking/visit` | 페이지 방문 기록 (프론트 라우트 변경 시 자동 호출) |
| GET | `/fde-api/tracking/stats` | 멤버별 방문 통계 |

### 랭킹

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/fde-api/ranking` | 전체 멤버 랭킹 (문제해결 점수 순 정렬) |
| GET | `/fde-api/ranking/{member_name}` | 특정 멤버 상세 (점수, 근거, GitHub, 방문수, 히스토리) |

### GitHub 지표 (실시간, 캐싱)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/fde-api/github/stats` | 전체 멤버 GitHub 활동 요약 |
| GET | `/fde-api/github/{member_name}` | 특정 멤버 PR, 커밋 상세 |

> GitHub 활동은 **GitHub 계정(username)**으로 멤버를 구분한다. `member_scores` 테이블에 `github_username` 컬럼을 두고 매핑.

### 문제해결 평가

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/fde-api/evaluate/run` | 수동 평가 트리거 (운영팀용) |

### Replica 조회 (범용)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/fde-api/replica/query` | replica DB 쿼리 (멤버들이 자기 페이지에서 활용) |

---

## 5. 랭킹 대시보드 프론트엔드

**URL**: `https://fde.butfitvolt.click/fde`

기존 FDE1 멤버 그리드 페이지를 랭킹 대시보드로 업그레이드한다.

### 화면 구성

**상단: 랭킹 보드**
- 문제해결 점수 순으로 멤버 정렬
- 각 항목: 슬랙 프로필 사진 + 이름 + 소속팀 + 점수 + 순위 변동(상승/하락)
- 1~3위 시각적 강조

**항목에 표시되는 지표:**
- 문제해결 점수 (절대점수, 에이전트 평가)
- 페이지 방문수 (실시간)
- GitHub 활동 요약 (PR 수, 커밋 수)
- 마지막 평가 일시

**항목 클릭 → 멤버 상세 페이지** (기존 `/fde/{member}` 경로 유지)
- 점수 변화 추이 차트
- 에이전트 평가 근거 전문
- GitHub PR/커밋 목록
- 이 멤버가 어떤 문제를 풀고 있는지, 어떻게 접근했는지

### 디자인 원칙

- 디자인 시스템(`https://erp.butfitvolt.click/butfitseoul/design-system`) 반드시 준수
- 데이터가 주인공, 클린 미니멀, 모바일 퍼스트
- CSS Modules + Pretendard 폰트
- Primary 컬러 #5B5FC7
- 안티패턴 회피: AI 슬롭(Inter+보라 그라데이션), 느린 애니메이션, 카드 남발

---

## 6. 문제해결 점수 평가 시스템

### 에이전트 입력 데이터

- **GitHub**: PR 내용, 커밋 메시지, 코드 변경 내역, 이슈
- **FDE DB**: 페이지 방문 트래킹 데이터 (실제로 사람들이 쓰는지)
- **이전 평가 히스토리** (변화 추이)

### 평가 기준 (절대점수 0~100)

| 기준 | 비중 | 설명 |
|---|---|---|
| 문제의 난이도 | 높음 | 쉬운 문제 vs 조직의 근본적 문제 |
| 조직 임팩트 | 높음 | 실제로 현장 업무에 변화를 줬는가 |
| 실제 사용 여부 | 높음 | 방문 데이터로 확인 — 만들어놓고 아무도 안 쓰면 낮은 점수 |
| 완성도 | 중간 | 계획만 거창하고 구현이 안 됐으면 낮은 점수 |
| 문제 정의 | 중간 | 문제를 제대로 파악하고 접근했는가 |

### 절대점수 원칙

- 상대 비교 아님 — 9명 다 0점일 수도, 다 높을 수도 있음
- 작은 문제를 잘 해결 = 적절한 점수
- 큰 문제를 잘 해결 = 높은 점수
- 거창한 계획 + 미완성 구현 + 사용자 없음 = 낮은 점수

### 구현 방식

- Python 스크립트: `backend/fde/jobs/evaluate.py`
- Claude API 호출 — 수집한 데이터를 프롬프트에 넣고 구조화된 JSON 응답 받기
- 크론탭 또는 systemd timer로 매일 새벽 실행
- `/fde-api/evaluate/run`으로 수동 트리거 가능

### 출력

- 멤버별 점수 + 평가 근거(텍스트)
- `member_scores` 테이블 업데이트
- `score_history` 테이블에 히스토리 추가

---

## 7. 운영 원칙

- **완전 자유** — 멤버들은 DB 테이블, API 라우터, 배포 모두 자유롭게 할 수 있음
- **한 팀** — 격리 없이 공유, 문제 생기면 같이 해결
- **모든 과정은 GitHub** — PR, 코드 리뷰, 이슈 모두 GitHub에서
- **배포** — 멤버 전원 PEM 키 보유, 직접 EC2 배포 가능
