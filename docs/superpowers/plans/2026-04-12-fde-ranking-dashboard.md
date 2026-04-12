# FDE 랭킹 대시보드 + FDE 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FDE 전용 백엔드(FastAPI)를 구축하고, 멤버 랭킹 대시보드(방문 트래킹 + GitHub 지표 + AI 문제해결 점수)를 `/fde` 페이지에 구현한다.

**Architecture:** 같은 EC2에 포트 8002로 FDE FastAPI 서버를 띄우고, Nginx에서 `/fde-api/*`를 프록시한다. 인증은 `api.butfit.io`로 검증 후 FDE 자체 JWT를 발급한다. FDE DB(PostgreSQL)에 트래킹/랭킹 데이터를 저장하고, replica DB는 읽기 전용으로 연결한다. 프론트엔드는 기존 FDE1 페이지를 랭킹 대시보드로 업그레이드한다.

**Tech Stack:** Python 3.11+ / FastAPI / uvicorn / psycopg2 / python-jose / requests / React 19 / TypeScript / CSS Modules / React Query v5

**Spec:** `docs/superpowers/specs/2026-04-12-fde-ranking-dashboard-design.md`

---

## 파일 구조

### 신규 생성

```
backend/fde/
├── main.py                    # FastAPI 앱, 미들웨어, CORS
├── routers/
│   ├── auth.py                # 로그인/me 엔드포인트
│   ├── tracking.py            # 방문 트래킹 API
│   ├���─ ranking.py             # 랭킹 조회 API
│   └── github.py              # GitHub 지표 API
├── utils/
│   ├── auth.py                # JWT 발급/검증
│   └── db.py                  # DB 연결 (FDE DB + replica)
├── jobs/
│   └── evaluate.py            # 문제해결 점수 평가 (크론잡)
├── schema.sql                 # FDE DB 초기 스키마
├── requirements.txt           # Python 의존성
└── .env.example               # 환경변수 템���릿
```

```
frontend/packages/erp/src/
├── api/
│   └── fde.ts                 # FDE 백엔드 API 함수들
└── pages/FDE1/
    ├── index.tsx               # (수정) 랭킹 대시보드로 업그레이드
    ├── FDE1.module.css         # (수정) 랭킹 UI 스타일
    └── MemberDetail.tsx        # 멤버 상세 (점수 추이, 평가 근거)
```

### 수정

```
frontend/packages/erp/src/api/client.ts          # FDE API baseURL 변경
frontend/packages/erp/src/contexts/AuthContext.tsx # FDE 백엔드 인증으로 전환
frontend/packages/erp/src/App.tsx                  # 방문 트래킹 훅 추가
frontend/packages/erp/.env.development             # VITE_API_URL → FDE 백엔드
frontend/packages/erp/.env.production              # VITE_API_URL → FDE 백엔드
deploy.sh                                          # FDE 백엔드 배포 추가
```

---

## Task 1: FDE 백엔드 프로젝트 셋업

**Files:**
- Create: `backend/fde/requirements.txt`
- Create: `backend/fde/.env.example`
- Create: `backend/fde/main.py`

- [ ] **Step 1: 디렉토리 구조 생성**

```bash
mkdir -p backend/fde/routers backend/fde/utils backend/fde/jobs
```

- [ ] **Step 2: requirements.txt 작성**

```
# backend/fde/requirements.txt
fastapi==0.115.12
uvicorn[standard]==0.34.2
python-jose[cryptography]==3.3.0
requests==2.32.3
psycopg2-binary==2.9.11
python-dotenv==1.1.0
anthropic==0.52.0
```

- [ ] **Step 3: .env.example 작성**

```
# backend/fde/.env.example

# FDE JWT 시크릿 (256-bit hex, 직접 생성: python -c "import secrets; print(secrets.token_hex(32))")
FDE_JWT_SECRET=changeme

# FDE DB (같은 EC2 PostgreSQL)
FDE_DB_HOST=localhost
FDE_DB_PORT=5432
FDE_DB_NAME=fde
FDE_DB_USER=fde
FDE_DB_PASSWORD=changeme

# Replica DB (버핏서울 읽기 전용)
REPLICA_DB_HOST=db-ro.butfit.io
REPLICA_DB_PORT=5432
REPLICA_DB_NAME=master_20221217
REPLICA_DB_USER=gilrokdo
REPLICA_DB_PASSWORD=changeme

# GitHub
GITHUB_TOKEN=changeme
GITHUB_REPO=버핏서울/FDE-1

# Claude API (문제해결 점수 평가용)
ANTHROPIC_API_KEY=changeme
```

- [ ] **Step 4: main.py 작성 — FastAPI 앱 기본 구조**

```python
# backend/fde/main.py
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routers import auth, tracking, ranking, github  # noqa: E402
from utils.auth import verify_access_token  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="FDE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fde.butfitvolt.click",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 인증 제외 경로
_AUTH_EXEMPT = {"/fde-api/auth/login", "/fde-api/health"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in _AUTH_EXEMPT:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "인증이 필요합니다"})

    token = auth_header.split(" ", 1)[1]
    payload = verify_access_token(token)
    if payload is None:
        return JSONResponse(status_code=401, content={"detail": "유효하지 않은 토큰입니다"})

    request.state.user = payload
    return await call_next(request)


app.include_router(auth.router, prefix="/fde-api/auth", tags=["auth"])
app.include_router(tracking.router, prefix="/fde-api/tracking", tags=["tracking"])
app.include_router(ranking.router, prefix="/fde-api/ranking", tags=["ranking"])
app.include_router(github.router, prefix="/fde-api/github", tags=["github"])


@app.get("/fde-api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: 커밋**

```bash
git add backend/fde/
git commit -m "feat: FDE 백엔드 프로젝트 초기 셋업 — FastAPI 기본 구조"
```

---

## Task 2: DB 유틸 + 스키마

**Files:**
- Create: `backend/fde/utils/__init__.py`
- Create: `backend/fde/utils/db.py`
- Create: `backend/fde/schema.sql`

- [ ] **Step 1: utils/__init__.py 생성**

```python
# backend/fde/utils/__init__.py
```

빈 파일.

- [ ] **Step 2: db.py 작성 — FDE DB + replica 연결**

```python
# backend/fde/utils/db.py
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras


def _get_conn(db_type: str = "fde"):
    if db_type == "replica":
        return psycopg2.connect(
            host=os.getenv("REPLICA_DB_HOST"),
            port=int(os.getenv("REPLICA_DB_PORT", "5432")),
            dbname=os.getenv("REPLICA_DB_NAME"),
            user=os.getenv("REPLICA_DB_USER"),
            password=os.getenv("REPLICA_DB_PASSWORD"),
            connect_timeout=10,
            options="-c statement_timeout=30000",
        )
    return psycopg2.connect(
        host=os.getenv("FDE_DB_HOST", "localhost"),
        port=int(os.getenv("FDE_DB_PORT", "5432")),
        dbname=os.getenv("FDE_DB_NAME", "fde"),
        user=os.getenv("FDE_DB_USER", "fde"),
        password=os.getenv("FDE_DB_PASSWORD"),
        connect_timeout=10,
    )


@contextmanager
def safe_db(db_type: str = "fde"):
    """Context manager: (connection, cursor) 반환, 자동 commit/close."""
    conn = _get_conn(db_type)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 3: schema.sql 작성 — FDE DB 초기 스키마**

```sql
-- backend/fde/schema.sql
-- FDE DB 초기 스키마
-- 실행: psql -U fde -d fde -f schema.sql

CREATE TABLE IF NOT EXISTS page_visits (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    user_name VARCHAR(50),
    page_path VARCHAR(255) NOT NULL,
    visited_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_scores (
    id SERIAL PRIMARY KEY,
    member_name VARCHAR(50) NOT NULL UNIQUE,
    github_username VARCHAR(50),
    problem_score DECIMAL(5,1) DEFAULT 0,
    score_reason TEXT DEFAULT '',
    github_stats JSONB DEFAULT '{}',
    visit_count INT DEFAULT 0,
    evaluated_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS score_history (
    id SERIAL PRIMARY KEY,
    member_name VARCHAR(50) NOT NULL,
    problem_score DECIMAL(5,1),
    score_reason TEXT,
    evaluated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(50),
    action_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_page_visits_page_path ON page_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_score_history_member ON score_history(member_name);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at);

-- 초기 멤버 데이터
INSERT INTO member_scores (member_name, github_username) VALUES
    ('김동하', NULL),
    ('김소연', NULL),
    ('김영신', NULL),
    ('박민규', NULL),
    ('이예원', NULL),
    ('최재은', NULL),
    ('최지희', NULL),
    ('최치환', NULL)
ON CONFLICT (member_name) DO NOTHING;
```

- [ ] **Step 4: 커밋**

```bash
git add backend/fde/utils/ backend/fde/schema.sql
git commit -m "feat: FDE DB 연결 유틸 + 초기 스키마"
```

---

## Task 3: 인증 (auth 라우터 + JWT 유틸)

**Files:**
- Create: `backend/fde/utils/auth.py`
- Create: `backend/fde/routers/__init__.py`
- Create: `backend/fde/routers/auth.py`

- [ ] **Step 1: JWT 유틸 작성**

```python
# backend/fde/utils/auth.py
import os
import time
from typing import Optional

from jose import JWTError, jwt

SECRET_KEY = os.getenv("FDE_JWT_SECRET", "changeme")
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 86400  # 24시간


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = int(time.time()) + TOKEN_EXPIRE_SECONDS
    payload["iat"] = int(time.time())
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
```

- [ ] **Step 2: routers/__init__.py 생성**

```python
# backend/fde/routers/__init__.py
```

빈 파일.

- [ ] **Step 3: auth 라우�� 작성 — butfit.io 인증 → FDE JWT 발급**

버핏볼트 auth.py에서 핵심 로직만 가져오고, 앱 타입별 권한 검증은 제거한다.

```python
# backend/fde/routers/auth.py
import base64
import json
import re
from datetime import datetime

import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.auth import create_access_token
from utils.db import safe_db

router = APIRouter()

BUTFIT_API = "https://api.butfit.io"


class LoginRequest(BaseModel):
    phone_number: str
    password: str


def _clean_phone(phone: str) -> str:
    return re.sub(r"[^0-9]", "", phone)


def _log_login(user_id: int | None, user_name: str | None, action: str):
    try:
        with safe_db("fde") as (conn, cur):
            cur.execute(
                "INSERT INTO login_logs (user_id, user_name, action_type) VALUES (%s, %s, %s)",
                (user_id, user_name, action),
            )
    except Exception:
        pass  # 로그 실패가 로그인을 막으면 안 됨


@router.post("/login")
def login(body: LoginRequest):
    phone = _clean_phone(body.phone_number)
    if not phone:
        raise HTTPException(400, "전화번호를 입력해주세요")

    # 1. 버핏서울 API로 비밀번호 검증
    try:
        resp = requests.post(
            f"{BUTFIT_API}/user/token/",
            json={"phone_number": phone, "password": body.password},
            timeout=10,
        )
    except requests.RequestException:
        raise HTTPException(502, "버핏서울 인증 서버에 연결할 수 없습니다")

    if resp.status_code != 200:
        _log_login(None, None, "login_fail")
        raise HTTPException(401, "전화번호 또는 비밀번호가 올바르지 않습니다")

    butfit_data = resp.json()
    access_token = butfit_data.get("access") or butfit_data.get("access_token", "")

    # 2. JWT에서 user_id 추출
    try:
        payload_part = access_token.split(".")[1]
        padding = 4 - len(payload_part) % 4
        decoded = json.loads(base64.b64decode(payload_part + "=" * padding))
        user_id = decoded.get("user_id")
    except Exception:
        raise HTTPException(500, "토큰 디코딩 실패")

    # 3. 버핏서울 API에서 사용자 정보 조회
    try:
        user_resp = requests.get(
            f"{BUTFIT_API}/api/user/{user_id}/",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        user_data = user_resp.json() if user_resp.status_code == 200 else {}
    except Exception:
        user_data = {}

    name = user_data.get("name", "")
    photo_100 = user_data.get("photo_100px_uri", "")
    photo_400 = user_data.get("photo_400px_uri", "")

    # 4. FDE 자체 JWT 발급
    token = create_access_token({
        "user_id": user_id,
        "phone_number": phone,
        "name": name,
    })

    _log_login(user_id, name, "login_success")

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "phone_number": phone,
            "photo_100px_uri": photo_100,
            "photo_400px_uri": photo_400,
        },
    }


@router.get("/me")
def me(request: Request):
    user = request.state.user
    return {
        "user_id": user["user_id"],
        "phone_number": user["phone_number"],
        "name": user["name"],
    }
```

- [ ] **Step 4: 로컬 테스트**

```bash
cd backend/fde
pip install -r requirements.txt
# .env 파일 생성 (.env.example 복사 후 값 채우기)
cp .env.example .env
# JWT 시크릿 생성
python -c "import secrets; print(secrets.token_hex(32))"
# 위 값을 .env의 FDE_JWT_SECRET에 넣기

# 서버 시작 (DB 없이도 health 엔드포인트 확인 가능)
uvicorn main:app --port 8002 --reload
# 다른 터미널에서:
curl http://localhost:8002/fde-api/health
# 예상 응답: {"status":"ok"}
```

- [ ] **Step 5: 커밋**

```bash
git add backend/fde/utils/auth.py backend/fde/routers/
git commit -m "feat: FDE 인증 — butfit.io 검증 + FDE JWT 발급"
```

---

## Task 4: 방문 트래킹 API

**Files:**
- Create: `backend/fde/routers/tracking.py`

- [ ] **Step 1: tracking 라우터 작성**

```python
# backend/fde/routers/tracking.py
from fastapi import APIRouter, Request
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter()


class VisitRequest(BaseModel):
    page_path: str


@router.post("/visit")
def record_visit(body: VisitRequest, request: Request):
    user = request.state.user
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "INSERT INTO page_visits (user_id, user_name, page_path) VALUES (%s, %s, %s)",
            (user["user_id"], user["name"], body.page_path),
        )
    return {"ok": True}


@router.get("/stats")
def visit_stats():
    """멤버 페이지별 방문 통계. /fde/{member} 경로만 집계."""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT page_path, COUNT(*) as visit_count,
                   COUNT(DISTINCT user_id) as unique_visitors
            FROM page_visits
            WHERE page_path LIKE '/fde/%'
            GROUP BY page_path
            ORDER BY visit_count DESC
        """)
        rows = cur.fetchall()
    return {"stats": [dict(r) for r in rows]}
```

- [ ] **Step 2: 커밋**

```bash
git add backend/fde/routers/tracking.py
git commit -m "feat: 방문 트래킹 API — 실시간 페이��� 방문 기록/통계"
```

---

## Task 5: GitHub 지표 API

**Files:**
- Create: `backend/fde/routers/github.py`

- [ ] **Step 1: github 라우터 작성**

```python
# backend/fde/routers/github.py
import os
import time
from typing import Any

import requests
from fastapi import APIRouter

from utils.db import safe_db

router = APIRouter()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")

# 간단한 메모리 캐시 (5분 TTL)
_cache: dict[str, Any] = {}
_cache_ts: float = 0
CACHE_TTL = 300


def _github_headers():
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _get_member_github_map() -> dict[str, str]:
    """member_scores 테이블에서 github_username 매핑 조회."""
    with safe_db("fde") as (conn, cur):
        cur.execute("SELECT member_name, github_username FROM member_scores WHERE github_username IS NOT NULL")
        return {row["github_username"]: row["member_name"] for row in cur.fetchall()}


def _fetch_github_stats() -> list[dict]:
    global _cache, _cache_ts
    now = time.time()
    if _cache and now - _cache_ts < CACHE_TTL:
        return _cache.get("stats", [])

    if not GITHUB_REPO:
        return []

    gh_to_member = _get_member_github_map()

    # PR 목록 (최근 100개)
    pr_resp = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/pulls",
        headers=_github_headers(),
        params={"state": "all", "per_page": 100},
        timeout=15,
    )
    prs = pr_resp.json() if pr_resp.status_code == 200 else []

    # 커밋 목록 (최근 100개)
    commit_resp = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/commits",
        headers=_github_headers(),
        params={"per_page": 100},
        timeout=15,
    )
    commits = commit_resp.json() if commit_resp.status_code == 200 else []

    # GitHub username별 집계
    member_stats: dict[str, dict] = {}
    for username, name in gh_to_member.items():
        member_stats[name] = {
            "member_name": name,
            "github_username": username,
            "pr_count": 0,
            "commit_count": 0,
            "prs": [],
        }

    for pr in prs:
        if not isinstance(pr, dict):
            continue
        gh_user = (pr.get("user") or {}).get("login", "")
        name = gh_to_member.get(gh_user)
        if name and name in member_stats:
            member_stats[name]["pr_count"] += 1
            member_stats[name]["prs"].append({
                "title": pr.get("title", ""),
                "number": pr.get("number"),
                "state": pr.get("state"),
                "created_at": pr.get("created_at"),
            })

    for c in commits:
        if not isinstance(c, dict):
            continue
        gh_user = (c.get("author") or {}).get("login", "")
        name = gh_to_member.get(gh_user)
        if name and name in member_stats:
            member_stats[name]["commit_count"] += 1

    result = list(member_stats.values())
    _cache = {"stats": result}
    _cache_ts = now
    return result


@router.get("/stats")
def github_stats():
    return {"stats": _fetch_github_stats()}


@router.get("/{member_name}")
def github_member(member_name: str):
    stats = _fetch_github_stats()
    for s in stats:
        if s["member_name"] == member_name:
            return s
    return {"member_name": member_name, "github_username": None, "pr_count": 0, "commit_count": 0, "prs": []}
```

- [ ] **Step 2: 커밋**

```bash
git add backend/fde/routers/github.py
git commit -m "feat: GitHub 지표 API — username 기반 PR/커밋 집계"
```

---

## Task 6: 랭킹 API

**Files:**
- Create: `backend/fde/routers/ranking.py`

- [ ] **Step 1: ranking 라우터 작성**

```python
# backend/fde/routers/ranking.py
from fastapi import APIRouter, HTTPException

from utils.db import safe_db

router = APIRouter()


@router.get("")
def get_ranking():
    """전체 멤버 랭킹 — 문제해결 점수 순 정렬."""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name, github_username, problem_score, score_reason,
                   github_stats, visit_count, evaluated_at, updated_at
            FROM member_scores
            ORDER BY problem_score DESC, member_name ASC
        """)
        rows = cur.fetchall()

    ranking = []
    for i, row in enumerate(rows, 1):
        entry = dict(row)
        entry["rank"] = i
        ranking.append(entry)
    return {"ranking": ranking}


@router.get("/{member_name}")
def get_member_detail(member_name: str):
    """특정 멤버 상세 — 점수, 근거, 히스토리."""
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT * FROM member_scores WHERE member_name = %s",
            (member_name,),
        )
        member = cur.fetchone()

    if not member:
        raise HTTPException(404, f"멤버를 찾을 수 없습니다: {member_name}")

    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT problem_score, score_reason, evaluated_at FROM score_history WHERE member_name = %s ORDER BY evaluated_at DESC LIMIT 30",
            (member_name,),
        )
        history = cur.fetchall()

    # 방문 통계
    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_visitors FROM page_visits WHERE page_path LIKE %s",
            (f"/fde/{member_name}%",),
        )
        visits = cur.fetchone()

    return {
        "member": dict(member),
        "history": [dict(h) for h in history],
        "visits": dict(visits) if visits else {"total": 0, "unique_visitors": 0},
    }
```

- [ ] **Step 2: 커밋**

```bash
git add backend/fde/routers/ranking.py
git commit -m "feat: 랭킹 API — 전체 랭킹 + 멤버 상세"
```

---

## Task 7: 문제해결 점수 평가 크론잡

**Files:**
- Create: `backend/fde/jobs/__init__.py`
- Create: `backend/fde/jobs/evaluate.py`

- [ ] **Step 1: jobs/__init__.py 생성**

```python
# backend/fde/jobs/__init__.py
```

빈 파일.

- [ ] **Step 2: evaluate.py 작성 — Claude API로 멤버별 문제해결 점수 평가**

```python
# backend/fde/jobs/evaluate.py
"""
FDE 멤버 문제해결 점수 평가 — 하루 1회 크론잡.
실행: python -m jobs.evaluate
"""
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# backend/fde 디렉토리를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anthropic
import requests

from utils.db import safe_db

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def _github_headers():
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def collect_github_data() -> str:
    """GitHub에서 PR, 커밋 데이터 수집."""
    if not GITHUB_REPO:
        return "GitHub 데이터 없음"

    prs = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/pulls",
        headers=_github_headers(),
        params={"state": "all", "per_page": 100},
        timeout=15,
    ).json()

    summary_lines = []
    for pr in prs:
        if not isinstance(pr, dict):
            continue
        user = (pr.get("user") or {}).get("login", "unknown")
        summary_lines.append(
            f"- PR #{pr.get('number')}: {pr.get('title')} (by @{user}, {pr.get('state')}, {pr.get('created_at', '')[:10]})"
        )

    return "\n".join(summary_lines) if summary_lines else "PR 없음"


def collect_visit_data() -> str:
    """FDE DB에서 방문 트래킹 데이터 수집."""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT page_path, COUNT(*) as visits, COUNT(DISTINCT user_id) as unique_visitors
            FROM page_visits
            WHERE page_path LIKE '/fde/%'
            GROUP BY page_path
            ORDER BY visits DESC
        """)
        rows = cur.fetchall()

    if not rows:
        return "방문 데이터 없음"

    lines = [f"- {r['page_path']}: {r['visits']}회 방문 ({r['unique_visitors']}명)" for r in rows]
    return "\n".join(lines)


def collect_previous_scores() -> str:
    """이전 평가 점수 히스토리."""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            SELECT member_name, problem_score, score_reason, evaluated_at
            FROM member_scores
            WHERE evaluated_at IS NOT NULL
            ORDER BY member_name
        """)
        rows = cur.fetchall()

    if not rows:
        return "이전 평가 없음"

    lines = [f"- {r['member_name']}: {r['problem_score']}점 ({r['evaluated_at']}) — {r['score_reason'][:100]}" for r in rows]
    return "\n".join(lines)


def get_member_list() -> list[str]:
    with safe_db("fde") as (conn, cur):
        cur.execute("SELECT member_name FROM member_scores ORDER BY member_name")
        return [r["member_name"] for r in cur.fetchall()]


def evaluate():
    """Claude API로 멤버별 문제해결 점수 평가."""
    members = get_member_list()
    if not members:
        print("평가할 멤버가 없습니다")
        return

    github_data = collect_github_data()
    visit_data = collect_visit_data()
    previous_scores = collect_previous_scores()

    prompt = f"""당신은 버핏서울 FDE(Frontend Developer Education) 프로그램의 평가 에이전트입니다.

## 평가 대상 멤버
{json.dumps(members, ensure_ascii=False)}

## GitHub 활동 (PR, 커밋)
{github_data}

## 페이지 방문 데이터 (실제 사용 여부)
{visit_data}

## 이전 평가 점수
{previous_scores}

## 평가 기준 (절대점수 0~100)
- **문제의 난이도** (비중 높음): 쉬운 문제 vs 조직의 근본적 문제
- **조직 임팩트** (비중 높음): 실제로 현장 업무에 변화를 줬는가
- **실제 사용 여부** (비중 높음): 방문 데이터로 확인 — 만들어놓고 아무도 안 쓰면 낮은 점수
- **완성도** (비중 중간): 계획만 거창하고 구현이 안 됐으면 낮은 점수
- **문제 정의** (비중 중간): 문제를 제대로 파악하고 접근했는가

## 절대점수 원칙
- 상대 비교가 아님 — 전원 0점일 수도, 전원 높을 수도 있음
- 작은 문제를 잘 해결 = 적절한 점수
- 큰 문제를 잘 해결 = 높은 점수
- 거창한 계획 + 미완성 구현 + 사용자 없음 = 낮은 점수

각 멤버에 대해 JSON 형식으로 응답해주세요:
```json
[
  {{"member_name": "이름", "problem_score": 0.0, "score_reason": "평가 근거 상세 설명"}}
]
```
JSON만 응답하세요. 다른 텍스트 없이."""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = response.content[0].text.strip()

    # JSON 파싱 (```json ... ``` 감싸져 있을 수 있음)
    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0].strip()

    scores = json.loads(response_text)

    # DB 업데이트
    for entry in scores:
        name = entry["member_name"]
        score = float(entry["problem_score"])
        reason = entry["score_reason"]

        with safe_db("fde") as (conn, cur):
            cur.execute(
                """UPDATE member_scores
                   SET problem_score = %s, score_reason = %s, evaluated_at = NOW(), updated_at = NOW()
                   WHERE member_name = %s""",
                (score, reason, name),
            )

            cur.execute(
                "INSERT INTO score_history (member_name, problem_score, score_reason) VALUES (%s, %s, %s)",
                (name, score, reason),
            )

    print(f"평가 완료: {len(scores)}명")
    for s in scores:
        print(f"  {s['member_name']}: {s['problem_score']}점")


if __name__ == "__main__":
    evaluate()
```

- [ ] **Step 3: main.py에 수동 평가 트리거 엔드포인트 추가**

`backend/fde/main.py`에 추가:

```python
# main.py 끝에 추가
from jobs.evaluate import evaluate as run_evaluate

@app.post("/fde-api/evaluate/run")
def trigger_evaluate(request: Request):
    """수동 평가 트리거 (운영팀용)."""
    import threading
    t = threading.Thread(target=run_evaluate, daemon=True)
    t.start()
    return {"message": "평가 시작됨. 완료까지 수 분 소요될 수 있습니다."}
```

- [ ] **Step 4: 커밋**

```bash
git add backend/fde/jobs/ backend/fde/main.py
git commit -m "feat: 문제해결 점수 평가 크론잡 — Claude API 기반 절대점수 평가"
```

---

## Task 8: 프론트엔드 — API 클라이언트 전환

**Files:**
- Modify: `frontend/packages/erp/.env.development`
- Modify: `frontend/packages/erp/.env.production`
- Create: `frontend/packages/erp/src/api/fde.ts`

- [ ] **Step 1: .env 파일 변경 — FDE 백엔드로 전환**

`.env.development`:
```
VITE_API_URL=http://localhost:8002
```

`.env.production`:
```
VITE_API_URL=https://fde.butfitvolt.click
```

> 프로덕션에서는 Nginx가 `/fde-api/*`를 8002로 프록시하므로, 같은 도메인을 쓰면 된다.

- [ ] **Step 2: FDE API 함수 작성**

```typescript
// frontend/packages/erp/src/api/fde.ts
import { api } from './client';

// 방문 트래킹
export function recordVisit(pagePath: string) {
  return api.post('/fde-api/tracking/visit', { page_path: pagePath }).catch(() => {
    // 트래킹 실패가 UX를 막으면 안 됨
  });
}

// 방문 통계
export function getVisitStats() {
  return api.get<{ stats: VisitStat[] }>('/fde-api/tracking/stats');
}

// 랭킹
export function getRanking() {
  return api.get<{ ranking: MemberRanking[] }>('/fde-api/ranking');
}

export function getMemberDetail(memberName: string) {
  return api.get<MemberDetail>(`/fde-api/ranking/${encodeURIComponent(memberName)}`);
}

// GitHub 지표
export function getGithubStats() {
  return api.get<{ stats: GithubStat[] }>('/fde-api/github/stats');
}

// 타입
export interface VisitStat {
  page_path: string;
  visit_count: number;
  unique_visitors: number;
}

export interface MemberRanking {
  rank: number;
  member_name: string;
  github_username: string | null;
  problem_score: number;
  score_reason: string;
  github_stats: Record<string, unknown>;
  visit_count: number;
  evaluated_at: string | null;
  updated_at: string;
}

export interface ScoreHistoryEntry {
  problem_score: number;
  score_reason: string;
  evaluated_at: string;
}

export interface MemberDetail {
  member: MemberRanking;
  history: ScoreHistoryEntry[];
  visits: { total: number; unique_visitors: number };
}

export interface GithubStat {
  member_name: string;
  github_username: string | null;
  pr_count: number;
  commit_count: number;
  prs: { title: string; number: number; state: string; created_at: string }[];
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/erp/.env.development frontend/packages/erp/.env.production frontend/packages/erp/src/api/fde.ts
git commit -m "feat: FDE API 클라이언트 — 백엔드 전환 + API 함수"
```

---

## Task 9: 프론트엔드 — 방문 트래킹 훅

**Files:**
- Modify: `frontend/packages/erp/src/App.tsx`

- [ ] **Step 1: App.tsx에 라우트 변경 시 방문 기록 훅 ��가**

`App.tsx` 수정 — `useLocation` + `useEffect`로 페이지 이동마다 트래킹:

```typescript
// App.tsx 상단에 import 추가
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { recordVisit } from './api/fde';

// App 컴포넌트 안에 추가 (return 전)
function usePageTracking() {
  const location = useLocation();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) {
      recordVisit(location.pathname);
    }
  }, [location.pathname, isLoggedIn]);
}

// App 컴포넌트 return 전에 호출
export default function App() {
  const { isLoggedIn } = useAuth();
  usePageTracking();
  // ... 기존 Routes
```

주의: `useLocation`은 `<Router>` 안에서만 동작하므로, `App`이 이미 `BrowserRouter` 안에 있는지 확인 필요. 그렇지 않으면 트래킹 로직을 Layout 안으로 이동.

- [ ] **Step 2: 커밋**

```bash
git add frontend/packages/erp/src/App.tsx
git commit -m "feat: 페이지 방문 자동 트래킹 — 라우트 변경 시 기록"
```

---

## Task 10: 프론트엔드 — 랭킹 대시보드 UI

**Files:**
- Modify: `frontend/packages/erp/src/pages/FDE1/index.tsx`
- Modify: `frontend/packages/erp/src/pages/FDE1/FDE1.module.css`

- [ ] **Step 1: FDE1 페이지를 랭킹 대시보드로 업그레이드**

```typescript
// frontend/packages/erp/src/pages/FDE1/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRanking, getGithubStats, type MemberRanking, type GithubStat } from '../../api/fde';
import { MENU_CONFIG } from '../../config/menuConfig';
import s from './FDE1.module.css';

const MEMBER_MENU = MENU_CONFIG.filter((m) => m.image && m.id !== 'do-gilrok');

function getMemberImage(name: string): string | undefined {
  return MEMBER_MENU.find((m) => m.label === name)?.image;
}

function getMemberPath(name: string): string {
  const menu = MEMBER_MENU.find((m) => m.label === name);
  return menu?.items[0]?.to ?? '/fde';
}

export default function FDE1() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<MemberRanking[]>([]);
  const [githubStats, setGithubStats] = useState<GithubStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getRanking().then((r) => setRanking(r.data.ranking)),
      getGithubStats().then((r) => setGithubStats(r.data.stats)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getGithub = (name: string) => githubStats.find((g) => g.member_name === name);

  if (loading) {
    return <div className={s.container}><p className={s.loading}>로딩 중...</p></div>;
  }

  return (
    <div className={s.container}>
      <h1 className={s.title}>FDE 1기</h1>
      <p className={s.desc}>문제해결 점수 기준 랭킹</p>

      <div className={s.rankingList}>
        {ranking.map((member) => {
          const gh = getGithub(member.member_name);
          const image = getMemberImage(member.member_name);

          return (
            <button
              key={member.member_name}
              className={`${s.rankItem} ${member.rank <= 3 ? s.topRank : ''}`}
              onClick={() => navigate(getMemberPath(member.member_name))}
            >
              <span className={s.rank}>#{member.rank}</span>

              {image ? (
                <img src={image} alt={member.member_name} className={s.avatar} />
              ) : (
                <div className={s.avatarFallback}>{member.member_name[0]}</div>
              )}

              <div className={s.info}>
                <span className={s.name}>{member.member_name}</span>
                <span className={s.score}>{member.problem_score}점</span>
              </div>

              <div className={s.stats}>
                <span className={s.stat}>방문 {member.visit_count}</span>
                {gh && (
                  <>
                    <span className={s.stat}>PR {gh.pr_count}</span>
                    <span className={s.stat}>커밋 {gh.commit_count}</span>
                  </>
                )}
              </div>

              {member.evaluated_at && (
                <span className={s.evaluated}>
                  {new Date(member.evaluated_at).toLocaleDateString('ko-KR')} 평가
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: FDE1.module.css 스타일 — 디자인 시스템 준수**

```css
/* frontend/packages/erp/src/pages/FDE1/FDE1.module.css */
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px;
}

.desc {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 24px;
}

.loading {
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
  text-align: center;
  padding: 40px 0;
}

.rankingList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rankItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  width: 100%;
  transition: border-color 0.15s;
}

.rankItem:hover {
  border-color: #5B5FC7;
}

.topRank {
  border-color: #5B5FC7;
  background: var(--surface-elevated, #fafaff);
}

.rank {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  min-width: 32px;
}

.topRank .rank {
  color: #5B5FC7;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.avatarFallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #5B5FC7;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 14px;
  font-weight: 600;
}

.score {
  font-size: 20px;
  font-weight: 700;
  color: #5B5FC7;
}

.stats {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.stat {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}

.evaluated {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
  white-space: nowrap;
}

/* 모바일 대응 */
@media (max-width: 480px) {
  .stats {
    display: none;
  }

  .evaluated {
    display: none;
  }
}
```

- [ ] **Step 3: 개발 서버에서 확인**

```bash
cd frontend && pnpm dev:erp
# http://localhost:5173/fde 에서 랭킹 UI 확인
# 백엔드가 아직 안 떠 있으면 로딩 후 빈 리스트 표시 (에러 아님)
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/erp/src/pages/FDE1/
git commit -m "feat: FDE 랭킹 대시보드 UI — 점수 순 멤버 리스트"
```

---

## Task 11: EC2 셋업 + 배포

**Files:**
- Modify: `deploy.sh`

- [ ] **Step 1: EC2에서 FDE DB 생성**

SSH 접속 후:

```bash
ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148

# PostgreSQL에 FDE DB + 유저 생성
sudo -u postgres psql -c "CREATE USER fde WITH PASSWORD '여기에_비밀번호';"
sudo -u postgres psql -c "CREATE DATABASE fde OWNER fde;"

# 스키마 적용
psql -U fde -d fde -f /path/to/schema.sql
```

- [ ] **Step 2: EC2에 FDE 백엔드 배포**

```bash
# EC2에서
cd /var/app
mkdir -p fde-backend
# 로컬에서 파일 전송
scp -i BUTFITSEOUL_FDE1.pem -r backend/fde/* ec2-user@13.209.66.148:/var/app/fde-backend/

# EC2에서 의존성 설치
cd /var/app/fde-backend
pip install -r requirements.txt

# .env 생성 (시크릿 값 채우기)
cp .env.example .env
nano .env

# systemd 서비스 파일 생성
sudo tee /etc/systemd/system/fde-backend.service << 'EOF'
[Unit]
Description=FDE Backend API
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/var/app/fde-backend
ExecStart=/usr/local/bin/uvicorn main:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fde-backend
sudo systemctl start fde-backend

# 확인
curl http://localhost:8002/fde-api/health
```

- [ ] **Step 3: Nginx 설정 — /fde-api 프록시 추가**

기존 Nginx 설정에 추가:

```nginx
# /fde-api → FDE 백엔드
location /fde-api/ {
    proxy_pass http://127.0.0.1:8002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 4: 크론잡 등록 — 매일 새벽 3시 평가 실행**

```bash
crontab -e
# 추가:
0 3 * * * cd /var/app/fde-backend && /usr/local/bin/python -m jobs.evaluate >> /var/log/fde-evaluate.log 2>&1
```

- [ ] **Step 5: deploy.sh 수정 — FDE 백엔드 배포 옵션 추가**

```bash
# deploy.sh에 fde-backend 케���스 추가
# 사용법: ./deploy.sh fde-backend
```

deploy.sh에 추가할 블록:

```bash
if [ "$1" = "fde-backend" ]; then
  echo "🚀 FDE 백엔드 배포 중..."
  scp -i BUTFITSEOUL_FDE1.pem -r backend/fde/* ec2-user@13.209.66.148:/var/app/fde-backend/
  ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148 "cd /var/app/fde-backend && pip install -r requirements.txt && sudo systemctl restart fde-backend"
  echo "✅ FDE 백엔드 배포 완료"
  exit 0
fi
```

- [ ] **Step 6: 커밋**

```bash
git add deploy.sh
git commit -m "feat: FDE 백엔드 배포 스크립트 + EC2 셋업 가이드"
```

---

## Task 12: 통합 테스트

- [ ] **Step 1: 백엔드 전체 흐름 확인**

```bash
# 로그인
curl -X POST http://localhost:8002/fde-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "01012345678", "password": "test"}'

# 토큰으로 me 확인
TOKEN="응답에서_받은_토큰"
curl http://localhost:8002/fde-api/auth/me -H "Authorization: Bearer $TOKEN"

# 방문 기록
curl -X POST http://localhost:8002/fde-api/tracking/visit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"page_path": "/fde/kim-dongha"}'

# 방문 통계
curl http://localhost:8002/fde-api/tracking/stats -H "Authorization: Bearer $TOKEN"

# 랭킹
curl http://localhost:8002/fde-api/ranking -H "Authorization: Bearer $TOKEN"

# GitHub
curl http://localhost:8002/fde-api/github/stats -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 2: 프론트엔드 통합 확인**

```bash
cd frontend && pnpm dev:erp
# 1. http://localhost:5173/login 에서 로그인
# 2. /fde 페이지에서 랭킹 리스트 표시 확인
# 3. 멤버 페이지 이동 후 방문 트래킹 동작 확인
# 4. 모바일 뷰포트에서 반응형 확인
```

- [ ] **Step 3: 평가 크론잡 수동 테스트**

```bash
cd backend/fde
python -m jobs.evaluate
# 예상: "평가 완료: 8명" + 멤버별 점수 출력
```

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: FDE 랭킹 대시보드 통합 완성 — 백엔드 + 프론트엔드 + 평가 시스템"
```
