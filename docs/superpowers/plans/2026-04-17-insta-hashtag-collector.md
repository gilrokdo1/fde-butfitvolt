# 인스타 해시태그 수집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도길록 페이지 하위에 "인스타 해시태그 수집기"를 만든다 — 등록된 해시태그(`팀버핏`, `TEAMBUTFIT`)를 매일 새벽 4시 자동 수집하고, 즉석 수집/필터/CSV 내보내기를 지원한다.

**Architecture:** FastAPI 라우터 + `instagrapi`(인스타 비공식 API 라이브러리) + 버너 인스타 계정 세션 캐시. FDE PostgreSQL에 게시물 누적. React 페이지에서 등록 해시태그 관리 + 즉석 수집 + 누적 게시물 테이블 + CSV 다운로드.

**Tech Stack:** FastAPI / psycopg2 / instagrapi / React 19 / TanStack Query v5 / CSS Modules

**TDD 적용 범위 안내:** 외부 인스타 API 의존부(`insta_scraper`)는 실 호출이 필요해 unit 테스트 비용이 큼 → 수동 검증으로 갈음. DB upsert 로직과 라우터 응답 구조는 코드 인스펙션 + 라우터 호출 검증으로 확인. 프론트는 dev 서버에서 시각 확인.

---

## Task 1: DB 스키마 추가

**Files:**
- Modify: `backend/fde/schema.sql` (파일 끝에 append)

- [ ] **Step 1: schema.sql에 새 테이블 정의 추가**

[backend/fde/schema.sql](backend/fde/schema.sql) 파일 끝에 다음 블록 추가:

```sql

-- ============================================================
-- 도길록: 인스타 해시태그 수집기
-- ============================================================

CREATE TABLE IF NOT EXISTS dogilrok_insta_hashtags (
    id SERIAL PRIMARY KEY,
    tag TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dogilrok_insta_posts (
    id SERIAL PRIMARY KEY,
    post_pk TEXT UNIQUE NOT NULL,
    shortcode TEXT NOT NULL,
    post_url TEXT NOT NULL,
    author_username TEXT,
    author_full_name TEXT,
    author_profile_pic_url TEXT,
    caption TEXT,
    media_type TEXT,
    thumbnail_url TEXT,
    like_count INT,
    comment_count INT,
    posted_at TIMESTAMPTZ,
    matched_tags TEXT[] NOT NULL DEFAULT '{}',
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dogilrok_insta_posts_posted_at
    ON dogilrok_insta_posts (posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_dogilrok_insta_posts_matched_tags
    ON dogilrok_insta_posts USING GIN (matched_tags);

INSERT INTO dogilrok_insta_hashtags (tag) VALUES ('팀버핏'), ('TEAMBUTFIT')
ON CONFLICT (tag) DO NOTHING;
```

- [ ] **Step 2: 로컬에서 syntax 검증 (선택)**

로컬 PostgreSQL이 있다면:
```bash
psql -d fde -f backend/fde/schema.sql
```
없다면 EC2 배포 시 lifespan에서 자동 적용되므로 skip 가능.

- [ ] **Step 3: 커밋**

```bash
git add backend/fde/schema.sql
git commit -m "feat: 도길록 — 인스타 해시태그 수집기 스키마 추가"
```

---

## Task 2: requirements.txt에 instagrapi 추가

**Files:**
- Modify: `backend/fde/requirements.txt`

- [ ] **Step 1: instagrapi 추가**

[backend/fde/requirements.txt](backend/fde/requirements.txt) 끝에 추가:

```
instagrapi==2.1.3
```

> 버전 픽스: 인스타 비공식 API라 마이너 변경에도 깨질 수 있어 명시 픽스. 추후 `pip install -U` 시 동작 확인 후 버전업.

- [ ] **Step 2: 커밋**

```bash
git add backend/fde/requirements.txt
git commit -m "chore: 도길록 — instagrapi 의존성 추가"
```

---

## Task 3: 인스타 스크래퍼 유틸 작성

**Files:**
- Create: `backend/fde/utils/insta_scraper.py`

- [ ] **Step 1: 스크래퍼 모듈 생성**

[backend/fde/utils/insta_scraper.py](backend/fde/utils/insta_scraper.py) 신규 작성:

```python
"""
인스타 해시태그 게시물 수집 (instagrapi 기반).

- 버너 인스타 계정으로 로그인 → 세션 파일 캐시
- hashtag_medias_recent로 최근 게시물 N개 가져와 DB upsert
- 같은 게시물이 여러 해시태그에 잡히면 matched_tags에 누적

환경변수 (EC2):
- INSTA_USERNAME: 버너 계정 ID
- INSTA_PASSWORD: 버너 계정 PW
- INSTA_SESSION_PATH: 세션 캐시 경로 (기본 /etc/fde/insta_session.json)
"""
import logging
import os
import time
from pathlib import Path
from typing import Any

from utils.db import safe_db

logger = logging.getLogger(__name__)

_DEFAULT_AMOUNT = 30
_HASHTAG_DELAY_SEC = 5
_LOGIN_RETRY = 3


def _session_path() -> Path:
    return Path(os.getenv("INSTA_SESSION_PATH", "/etc/fde/insta_session.json"))


def _get_client():
    """instagrapi 클라이언트를 세션 캐시 또는 새 로그인으로 준비."""
    from instagrapi import Client
    from instagrapi.exceptions import LoginRequired

    username = os.getenv("INSTA_USERNAME")
    password = os.getenv("INSTA_PASSWORD")
    if not username or not password:
        raise RuntimeError("INSTA_USERNAME/INSTA_PASSWORD 환경변수가 필요합니다")

    cl = Client()
    cl.delay_range = [1, 3]

    sp = _session_path()
    if sp.exists():
        try:
            cl.load_settings(sp)
            cl.login(username, password)
            cl.get_timeline_feed()  # 세션 유효성 확인 호출
            return cl
        except LoginRequired:
            logger.warning("[insta] 세션 만료, 재로그인")
        except Exception as e:
            logger.warning(f"[insta] 세션 로드 실패: {e} → 재로그인")

    last_err = None
    for attempt in range(1, _LOGIN_RETRY + 1):
        try:
            cl = Client()
            cl.delay_range = [1, 3]
            cl.login(username, password)
            sp.parent.mkdir(parents=True, exist_ok=True)
            cl.dump_settings(sp)
            return cl
        except Exception as e:
            last_err = e
            wait = 5 * attempt
            logger.warning(f"[insta] 로그인 실패 ({attempt}/{_LOGIN_RETRY}): {e} → {wait}s 대기")
            time.sleep(wait)
    raise RuntimeError(f"인스타 로그인 실패: {last_err}")


def _media_to_row(m: Any, tag: str) -> dict:
    """instagrapi Media 객체 → DB row dict."""
    media_type_map = {1: "photo", 2: "video", 8: "carousel"}
    return {
        "post_pk": str(m.pk),
        "shortcode": m.code,
        "post_url": f"https://www.instagram.com/p/{m.code}/",
        "author_username": getattr(m.user, "username", None),
        "author_full_name": getattr(m.user, "full_name", None),
        "author_profile_pic_url": str(getattr(m.user, "profile_pic_url", "") or "") or None,
        "caption": (m.caption_text or "")[:5000],
        "media_type": media_type_map.get(getattr(m, "media_type", 0), "unknown"),
        "thumbnail_url": str(getattr(m, "thumbnail_url", "") or "") or None,
        "like_count": getattr(m, "like_count", 0) or 0,
        "comment_count": getattr(m, "comment_count", 0) or 0,
        "posted_at": getattr(m, "taken_at", None),
        "matched_tags": [tag],
    }


def _upsert_post(cur, row: dict) -> bool:
    """ON CONFLICT으로 upsert. 신규=True, 업데이트=False."""
    cur.execute(
        """
        INSERT INTO dogilrok_insta_posts (
            post_pk, shortcode, post_url,
            author_username, author_full_name, author_profile_pic_url,
            caption, media_type, thumbnail_url,
            like_count, comment_count, posted_at,
            matched_tags
        ) VALUES (
            %(post_pk)s, %(shortcode)s, %(post_url)s,
            %(author_username)s, %(author_full_name)s, %(author_profile_pic_url)s,
            %(caption)s, %(media_type)s, %(thumbnail_url)s,
            %(like_count)s, %(comment_count)s, %(posted_at)s,
            %(matched_tags)s
        )
        ON CONFLICT (post_pk) DO UPDATE SET
            like_count = EXCLUDED.like_count,
            comment_count = EXCLUDED.comment_count,
            collected_at = NOW(),
            matched_tags = ARRAY(
                SELECT DISTINCT UNNEST(
                    dogilrok_insta_posts.matched_tags || EXCLUDED.matched_tags
                )
            )
        RETURNING (xmax = 0) AS inserted
        """,
        row,
    )
    result = cur.fetchone()
    return bool(result and result.get("inserted"))


def collect_hashtag(tag: str, amount: int = _DEFAULT_AMOUNT) -> dict:
    """단일 해시태그 수집. 결과 요약 dict 반환."""
    tag_clean = tag.lstrip("#").strip()
    if not tag_clean:
        raise ValueError("해시태그가 비어있습니다")

    started = time.time()
    cl = _get_client()
    try:
        medias = cl.hashtag_medias_recent(tag_clean, amount=amount)
    except Exception as e:
        logger.error(f"[insta] 해시태그 조회 실패 #{tag_clean}: {e}")
        raise

    inserted = 0
    updated = 0
    with safe_db("fde") as (_, cur):
        for m in medias:
            row = _media_to_row(m, tag_clean)
            if _upsert_post(cur, row):
                inserted += 1
            else:
                updated += 1
        cur.execute(
            "UPDATE dogilrok_insta_hashtags SET last_collected_at = NOW() WHERE tag = %s",
            (tag_clean,),
        )

    elapsed = round(time.time() - started, 1)
    logger.info(f"[insta] #{tag_clean} 수집 완료 — 신규 {inserted}, 갱신 {updated}, {elapsed}s")
    return {
        "tag": tag_clean,
        "fetched": len(medias),
        "inserted": inserted,
        "updated": updated,
        "elapsed_sec": elapsed,
    }


def collect_active_hashtags(amount: int = _DEFAULT_AMOUNT) -> dict:
    """is_active=true 해시태그 모두 순회 수집."""
    with safe_db("fde") as (_, cur):
        cur.execute(
            "SELECT tag FROM dogilrok_insta_hashtags WHERE is_active = TRUE ORDER BY id"
        )
        tags = [r["tag"] for r in cur.fetchall()]

    results = []
    for i, tag in enumerate(tags):
        try:
            results.append(collect_hashtag(tag, amount=amount))
        except Exception as e:
            logger.error(f"[insta] #{tag} 실패: {e}")
            results.append({"tag": tag, "error": str(e)})
        if i < len(tags) - 1:
            time.sleep(_HASHTAG_DELAY_SEC)

    return {
        "total_tags": len(tags),
        "results": results,
    }
```

- [ ] **Step 2: import 검증 (instagrapi 미설치 환경에서도 모듈 자체는 import 가능해야 함 — 함수 호출 시점에 import)**

확인: `from instagrapi import Client`는 `_get_client` 함수 안에 있어 모듈 import 시점엔 평가 안 됨. ✓

- [ ] **Step 3: 커밋**

```bash
git add backend/fde/utils/insta_scraper.py
git commit -m "feat: 도길록 — 인스타 해시태그 스크래퍼 유틸"
```

---

## Task 4: FastAPI 라우터 작성

**Files:**
- Create: `backend/fde/routers/dogilrok_insta.py`

- [ ] **Step 1: 라우터 생성**

[backend/fde/routers/dogilrok_insta.py](backend/fde/routers/dogilrok_insta.py) 신규 작성:

```python
"""도길록: 인스타 해시태그 수집기 라우터."""
import csv
import io
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from utils.db import safe_db

router = APIRouter()

_TAG_RE = re.compile(r"^[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]+$")


# ── 해시태그 관리 ─────────────────────────────────────────────────────────────

class HashtagCreate(BaseModel):
    tag: str = Field(..., min_length=1, max_length=100)


class HashtagPatch(BaseModel):
    is_active: bool


def _normalize_tag(raw: str) -> str:
    t = raw.strip().lstrip("#").strip()
    if not t:
        raise HTTPException(400, "해시태그가 비어있습니다")
    if not _TAG_RE.match(t):
        raise HTTPException(400, "해시태그는 한글/영문/숫자/_ 만 가능합니다 (# 제외)")
    return t


@router.get("/hashtags")
def list_hashtags():
    with safe_db("fde") as (_, cur):
        cur.execute(
            """
            SELECT id, tag, is_active, created_at, last_collected_at
            FROM dogilrok_insta_hashtags
            ORDER BY id
            """
        )
        rows = cur.fetchall()
    return {"hashtags": [dict(r) for r in rows]}


@router.post("/hashtags")
def create_hashtag(body: HashtagCreate):
    tag = _normalize_tag(body.tag)
    with safe_db("fde") as (_, cur):
        cur.execute(
            """
            INSERT INTO dogilrok_insta_hashtags (tag) VALUES (%s)
            ON CONFLICT (tag) DO NOTHING
            RETURNING id, tag, is_active, created_at, last_collected_at
            """,
            (tag,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                "SELECT id, tag, is_active, created_at, last_collected_at "
                "FROM dogilrok_insta_hashtags WHERE tag = %s",
                (tag,),
            )
            row = cur.fetchone()
    return dict(row)


@router.patch("/hashtags/{hashtag_id}")
def patch_hashtag(hashtag_id: int, body: HashtagPatch):
    with safe_db("fde") as (_, cur):
        cur.execute(
            """
            UPDATE dogilrok_insta_hashtags SET is_active = %s WHERE id = %s
            RETURNING id, tag, is_active, created_at, last_collected_at
            """,
            (body.is_active, hashtag_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "해시태그를 찾을 수 없습니다")
    return dict(row)


@router.delete("/hashtags/{hashtag_id}")
def delete_hashtag(hashtag_id: int):
    with safe_db("fde") as (_, cur):
        cur.execute("DELETE FROM dogilrok_insta_hashtags WHERE id = %s", (hashtag_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "해시태그를 찾을 수 없습니다")
    return {"message": "삭제됨"}


# ── 즉석 수집 ─────────────────────────────────────────────────────────────────

class CollectRequest(BaseModel):
    tag: str = Field(..., min_length=1)
    limit: int = Field(default=30, ge=1, le=100)


@router.post("/collect")
def collect_now(body: CollectRequest):
    """즉석 수집. 동기 실행 (보통 10~60초)."""
    tag = _normalize_tag(body.tag)
    from utils.insta_scraper import collect_hashtag
    try:
        result = collect_hashtag(tag, amount=body.limit)
    except Exception as e:
        raise HTTPException(500, f"수집 실패: {e}")
    return result


# ── 게시물 조회 ───────────────────────────────────────────────────────────────

def _build_posts_query(tag: Optional[str], search: Optional[str], sort: str):
    where = []
    params: list = []

    if tag:
        where.append("%s = ANY(matched_tags)")
        params.append(tag)
    if search:
        where.append("(caption ILIKE %s OR author_username ILIKE %s)")
        params.append(f"%{search}%")
        params.append(f"%{search}%")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    order_map = {
        "posted_at_desc": "posted_at DESC NULLS LAST",
        "posted_at_asc": "posted_at ASC NULLS LAST",
        "like_desc": "like_count DESC NULLS LAST",
    }
    order_sql = order_map.get(sort, "posted_at DESC NULLS LAST")
    return where_sql, params, order_sql


@router.get("/posts")
def list_posts(
    tag: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort: str = Query(default="posted_at_desc"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    where_sql, params, order_sql = _build_posts_query(tag, search, sort)

    with safe_db("fde") as (_, cur):
        cur.execute(f"SELECT COUNT(*) AS c FROM dogilrok_insta_posts {where_sql}", params)
        total = cur.fetchone()["c"]

        cur.execute(
            f"""
            SELECT
                id, post_pk, shortcode, post_url,
                author_username, author_full_name, author_profile_pic_url,
                caption, media_type, thumbnail_url,
                like_count, comment_count, posted_at,
                matched_tags, collected_at
            FROM dogilrok_insta_posts
            {where_sql}
            ORDER BY {order_sql}
            OFFSET %s LIMIT %s
            """,
            params + [offset, limit],
        )
        rows = cur.fetchall()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "posts": [dict(r) for r in rows],
    }


@router.get("/posts/export.csv")
def export_posts_csv(
    tag: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort: str = Query(default="posted_at_desc"),
):
    where_sql, params, order_sql = _build_posts_query(tag, search, sort)

    with safe_db("fde") as (_, cur):
        cur.execute(
            f"""
            SELECT
                posted_at, author_username, author_full_name,
                like_count, comment_count, caption,
                matched_tags, post_url
            FROM dogilrok_insta_posts
            {where_sql}
            ORDER BY {order_sql}
            """,
            params,
        )
        rows = cur.fetchall()

    buf = io.StringIO()
    buf.write("\ufeff")  # 엑셀 한글 깨짐 방지 (UTF-8 BOM)
    writer = csv.writer(buf)
    writer.writerow(["게시일", "작성자", "이름", "좋아요", "댓글", "본문", "해시태그", "링크"])
    for r in rows:
        writer.writerow([
            r["posted_at"].isoformat() if r["posted_at"] else "",
            r["author_username"] or "",
            r["author_full_name"] or "",
            r["like_count"] or 0,
            r["comment_count"] or 0,
            (r["caption"] or "").replace("\n", " "),
            ",".join(r["matched_tags"] or []),
            r["post_url"],
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="insta_posts.csv"'},
    )
```

- [ ] **Step 2: 커밋**

```bash
git add backend/fde/routers/dogilrok_insta.py
git commit -m "feat: 도길록 — 인스타 해시태그 라우터 추가"
```

---

## Task 5: main.py에 라우터 + 새벽 4시 cron 등록

**Files:**
- Modify: `backend/fde/main.py:12` (import 줄), `backend/fde/main.py:46-47` (lifespan), `backend/fde/main.py:90-97` (include_router)

- [ ] **Step 1: main.py import 추가**

[backend/fde/main.py:12](backend/fde/main.py#L12) 줄을 다음으로 교체:

```python
from routers import auth, tracking, ranking, github, soyeon, parkmingyu, sales, dongha_sales, dogilrok_insta
```

- [ ] **Step 2: lifespan에 새벽 4시 cron 등록**

[backend/fde/main.py:46-47](backend/fde/main.py#L46-L47) 영역(`from jobs.detect_anomalies` ~ `_schedule_daily(hour=3, ...)`) 바로 아래에 추가:

```python
    from utils.insta_scraper import collect_active_hashtags
    _schedule_daily(hour=4, func=lambda: collect_active_hashtags(amount=30))  # 매일 새벽 4시 KST
```

> 위치: `_schedule_daily(hour=3, func=detect)` 다음 줄, `yield` 이전.

- [ ] **Step 3: include_router 추가**

[backend/fde/main.py:97](backend/fde/main.py#L97) `app.include_router(dongha_sales.router)` 다음 줄에 추가:

```python
app.include_router(dogilrok_insta.router, prefix="/fde-api/dogilrok/insta", tags=["dogilrok-insta"])
```

- [ ] **Step 4: 로컬 syntax 검증 (선택)**

```bash
cd backend/fde && python -c "import main"
```
psycopg2 등 미설치 시 에러 가능 → 무시하고 EC2 배포로 검증.

- [ ] **Step 5: 커밋**

```bash
git add backend/fde/main.py
git commit -m "feat: 도길록 — 인스타 라우터 + 새벽 4시 cron 등록"
```

---

## Task 6: 프론트 API 클라이언트 추가

**Files:**
- Modify: `frontend/packages/erp/src/api/fde.ts` (파일 끝에 append)

- [ ] **Step 1: API 함수 + 타입 추가**

[frontend/packages/erp/src/api/fde.ts](frontend/packages/erp/src/api/fde.ts) 파일 끝에 다음 블록 추가:

```typescript

// ── 도길록: 인스타 해시태그 수집기 ───────────────────────────────────────────

export interface InstaHashtag {
  id: number;
  tag: string;
  is_active: boolean;
  created_at: string;
  last_collected_at: string | null;
}

export interface InstaPost {
  id: number;
  post_pk: string;
  shortcode: string;
  post_url: string;
  author_username: string | null;
  author_full_name: string | null;
  author_profile_pic_url: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  like_count: number;
  comment_count: number;
  posted_at: string | null;
  matched_tags: string[];
  collected_at: string;
}

export interface InstaCollectResult {
  tag: string;
  fetched: number;
  inserted: number;
  updated: number;
  elapsed_sec: number;
}

export function getInstaHashtags() {
  return api.get<{ hashtags: InstaHashtag[] }>('/fde-api/dogilrok/insta/hashtags');
}

export function createInstaHashtag(tag: string) {
  return api.post<InstaHashtag>('/fde-api/dogilrok/insta/hashtags', { tag });
}

export function patchInstaHashtag(id: number, is_active: boolean) {
  return api.patch<InstaHashtag>(`/fde-api/dogilrok/insta/hashtags/${id}`, { is_active });
}

export function deleteInstaHashtag(id: number) {
  return api.delete(`/fde-api/dogilrok/insta/hashtags/${id}`);
}

export function collectInstaNow(tag: string, limit = 30) {
  return api.post<InstaCollectResult>('/fde-api/dogilrok/insta/collect', { tag, limit });
}

export function getInstaPosts(params: {
  tag?: string;
  search?: string;
  sort?: 'posted_at_desc' | 'posted_at_asc' | 'like_desc';
  offset?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params.tag) q.set('tag', params.tag);
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString();
  return api.get<{ total: number; offset: number; limit: number; posts: InstaPost[] }>(
    `/fde-api/dogilrok/insta/posts${qs ? `?${qs}` : ''}`,
  );
}

export function instaPostsExportUrl(params: { tag?: string; search?: string; sort?: string }) {
  const q = new URLSearchParams();
  if (params.tag) q.set('tag', params.tag);
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  const qs = q.toString();
  return `/fde-api/dogilrok/insta/posts/export.csv${qs ? `?${qs}` : ''}`;
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/packages/erp/src/api/fde.ts
git commit -m "feat: 도길록 — 인스타 API 클라이언트 함수 추가"
```

---

## Task 7: 인스타 페이지 컴포넌트 작성

**Files:**
- Create: `frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/index.tsx`
- Create: `frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/InstaHashtag.module.css`

- [ ] **Step 1: index.tsx 작성 (단일 파일에 모든 컴포넌트, ~300줄)**

[frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/index.tsx](frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/index.tsx) 신규:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInstaHashtags,
  createInstaHashtag,
  patchInstaHashtag,
  deleteInstaHashtag,
  collectInstaNow,
  getInstaPosts,
  instaPostsExportUrl,
  type InstaPost,
} from '../../../../api/fde';
import { API_BASE_URL } from '../../../../api/client';
import s from './InstaHashtag.module.css';

const PAGE_SIZE = 50;

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateOnly(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function truncate(text: string | null, n: number) {
  if (!text) return '';
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// ── HashtagManager ──────────────────────────────────────────────────────────

function HashtagManager() {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState('');

  const { data } = useQuery({
    queryKey: ['insta-hashtags'],
    queryFn: () => getInstaHashtags().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (tag: string) => createInstaHashtag(tag),
    onSuccess: () => {
      setNewTag('');
      qc.invalidateQueries({ queryKey: ['insta-hashtags'] });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      patchInstaHashtag(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insta-hashtags'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteInstaHashtag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insta-hashtags'] }),
  });

  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>등록된 해시태그</h2>
      <p className={s.sectionHint}>매일 새벽 4시 자동 수집. 토글로 일시 정지 가능.</p>
      <div className={s.tagList}>
        {data?.hashtags.map((h) => (
          <div key={h.id} className={`${s.tagChip} ${!h.is_active ? s.tagChipOff : ''}`}>
            <span className={s.tagName}>#{h.tag}</span>
            <span className={s.tagMeta}>
              마지막 수집: {h.last_collected_at ? formatDateTime(h.last_collected_at) : '없음'}
            </span>
            <button
              className={s.tagToggle}
              onClick={() => toggle.mutate({ id: h.id, active: !h.is_active })}
            >
              {h.is_active ? '활성' : '정지'}
            </button>
            <button
              className={s.tagDelete}
              onClick={() => {
                if (window.confirm(`#${h.tag} 삭제? 누적 게시물은 남습니다.`)) {
                  remove.mutate(h.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <form
        className={s.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (newTag.trim()) create.mutate(newTag.trim());
        }}
      >
        <input
          className={s.input}
          placeholder="해시태그 추가 (# 없이)"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
        />
        <button type="submit" className={s.btnPrimary} disabled={create.isPending}>
          {create.isPending ? '추가 중...' : '추가'}
        </button>
      </form>
    </section>
  );
}

// ── CollectNow ──────────────────────────────────────────────────────────────

function CollectNow() {
  const qc = useQueryClient();
  const [tag, setTag] = useState('');
  const [limit, setLimit] = useState(30);
  const [result, setResult] = useState<string>('');

  const collect = useMutation({
    mutationFn: () => collectInstaNow(tag.trim(), limit),
    onSuccess: (res) => {
      const r = res.data;
      setResult(
        `#${r.tag}: 가져옴 ${r.fetched} / 신규 ${r.inserted} / 갱신 ${r.updated} (${r.elapsed_sec}s)`,
      );
      qc.invalidateQueries({ queryKey: ['insta-posts'] });
      qc.invalidateQueries({ queryKey: ['insta-hashtags'] });
      setTimeout(() => setResult(''), 8000);
    },
    onError: (e: Error) => setResult(`실패: ${e.message}`),
  });

  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>즉석 수집</h2>
      <p className={s.sectionHint}>임의 해시태그 즉시 수집 (10~60초 소요). 결과는 누적 테이블에 저장됨.</p>
      <div className={s.collectRow}>
        <input
          className={s.input}
          placeholder="해시태그 (# 없이)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <input
          className={`${s.input} ${s.inputNumber}`}
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <button
          className={s.btnPrimary}
          onClick={() => tag.trim() && collect.mutate()}
          disabled={collect.isPending}
        >
          {collect.isPending ? '수집 중...' : '수집하기'}
        </button>
      </div>
      {result && <div className={s.collectResult}>{result}</div>}
    </section>
  );
}

// ── PostsTable ──────────────────────────────────────────────────────────────

interface PostsFilters {
  tag: string;
  search: string;
  sort: 'posted_at_desc' | 'posted_at_asc' | 'like_desc';
  offset: number;
}

function PostsTable() {
  const [filters, setFilters] = useState<PostsFilters>({
    tag: '',
    search: '',
    sort: 'posted_at_desc',
    offset: 0,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: hashtagsData } = useQuery({
    queryKey: ['insta-hashtags'],
    queryFn: () => getInstaHashtags().then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['insta-posts', filters],
    queryFn: () =>
      getInstaPosts({
        tag: filters.tag || undefined,
        search: filters.search || undefined,
        sort: filters.sort,
        offset: filters.offset,
        limit: PAGE_SIZE,
      }).then((r) => r.data),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1;

  const goPage = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setFilters((f) => ({ ...f, offset: (clamped - 1) * PAGE_SIZE }));
  };

  const exportHref = `${API_BASE_URL}${instaPostsExportUrl({
    tag: filters.tag || undefined,
    search: filters.search || undefined,
    sort: filters.sort,
  })}`;

  return (
    <section className={s.section}>
      <div className={s.tableHeader}>
        <h2 className={s.sectionTitle}>
          누적 게시물 <span className={s.totalBadge}>{data?.total ?? 0}</span>
        </h2>
        <a className={s.btnSecondary} href={exportHref} download>
          📥 CSV 다운로드
        </a>
      </div>

      <div className={s.filters}>
        <select
          className={s.select}
          value={filters.tag}
          onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value, offset: 0 }))}
        >
          <option value="">전체 해시태그</option>
          {hashtagsData?.hashtags.map((h) => (
            <option key={h.id} value={h.tag}>#{h.tag}</option>
          ))}
        </select>
        <input
          className={s.input}
          placeholder="작성자 / 본문 검색"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, offset: 0 }))}
        />
        <select
          className={s.select}
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as PostsFilters['sort'], offset: 0 }))}
        >
          <option value="posted_at_desc">최신순</option>
          <option value="posted_at_asc">오래된순</option>
          <option value="like_desc">좋아요순</option>
        </select>
      </div>

      {isLoading && <p className={s.state}>불러오는 중...</p>}
      {data && data.posts.length === 0 && (
        <p className={s.state}>아직 수집된 게시물이 없습니다. 위 "즉석 수집"으로 시작해보세요.</p>
      )}

      {data && data.posts.length > 0 && (
        <>
          <table className={s.table}>
            <thead>
              <tr>
                <th>썸네일</th>
                <th>작성자</th>
                <th>본문</th>
                <th>좋아요</th>
                <th>댓글</th>
                <th>게시일</th>
                <th>해시태그</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <PostRow
                  key={p.id}
                  post={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                />
              ))}
            </tbody>
          </table>

          <div className={s.pager}>
            <button onClick={() => goPage(currentPage - 1)} disabled={currentPage <= 1}>
              ← 이전
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button onClick={() => goPage(currentPage + 1)} disabled={currentPage >= totalPages}>
              다음 →
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PostRow({
  post,
  expanded,
  onToggle,
}: {
  post: InstaPost;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          {post.thumbnail_url ? (
            <img className={s.thumb} src={post.thumbnail_url} alt="" loading="lazy" />
          ) : (
            <div className={s.thumbPlaceholder}>—</div>
          )}
        </td>
        <td className={s.author}>@{post.author_username}</td>
        <td className={s.captionCell} onClick={onToggle}>
          {expanded ? (
            <span className={s.captionFull}>{post.caption || '(본문 없음)'}</span>
          ) : (
            truncate(post.caption, 80) || '(본문 없음)'
          )}
        </td>
        <td className={s.num}>{post.like_count.toLocaleString()}</td>
        <td className={s.num}>{post.comment_count.toLocaleString()}</td>
        <td className={s.date}>{formatDateOnly(post.posted_at)}</td>
        <td className={s.tags}>{post.matched_tags.map((t) => `#${t}`).join(' ')}</td>
        <td>
          <a className={s.linkBtn} href={post.post_url} target="_blank" rel="noreferrer">
            ↗
          </a>
        </td>
      </tr>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function InstaHashtagPage() {
  return (
    <div className={s.container}>
      <header className={s.pageHeader}>
        <h1 className={s.pageTitle}>인스타 해시태그 수집기</h1>
        <p className={s.pageSubtitle}>
          등록한 해시태그 자동 수집 + 즉석 수집 + 누적 검색. 매일 새벽 4시 자동 갱신.
        </p>
      </header>
      <HashtagManager />
      <CollectNow />
      <PostsTable />
    </div>
  );
}
```

- [ ] **Step 2: CSS Module 작성**

[frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/InstaHashtag.module.css](frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/InstaHashtag.module.css) 신규:

```css
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 80px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.pageHeader { margin-bottom: 8px; }
.pageTitle {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #1a1a1a;
}
.pageSubtitle {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.section {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  padding: 20px;
}
.sectionTitle {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sectionHint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #888;
}

.totalBadge {
  background: #5B5FC7;
  color: white;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 500;
}

.tagList {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.tagChip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #f4f4f9;
  border: 1px solid #e2e2ec;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
}
.tagChipOff { opacity: 0.5; }
.tagName { font-weight: 600; color: #5B5FC7; }
.tagMeta { color: #888; font-size: 12px; }
.tagToggle {
  border: none;
  background: transparent;
  font-size: 11px;
  color: #5B5FC7;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.tagToggle:hover { background: rgba(91,95,199,0.1); }
.tagDelete {
  border: none;
  background: transparent;
  color: #c33;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.addForm, .collectRow {
  display: flex;
  gap: 8px;
  align-items: center;
}
.input {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
}
.input:focus {
  outline: none;
  border-color: #5B5FC7;
}
.inputNumber { flex: 0 0 80px; }

.btnPrimary {
  background: #5B5FC7;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
.btnPrimary:hover:not(:disabled) { background: #4a4eb5; }

.btnSecondary {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  text-decoration: none;
  color: #333;
  background: white;
}
.btnSecondary:hover { background: #f8f8f8; }

.collectResult {
  margin-top: 12px;
  padding: 10px 14px;
  background: #f0f4ff;
  border-radius: 8px;
  font-size: 13px;
  color: #2a3380;
}

.tableHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.select {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  background: white;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th, .table td {
  padding: 10px 8px;
  border-bottom: 1px solid #eee;
  text-align: left;
  vertical-align: middle;
}
.table th {
  font-weight: 600;
  color: #666;
  background: #fafafa;
  font-size: 12px;
}

.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.thumbPlaceholder {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
}
.author { font-weight: 500; color: #5B5FC7; white-space: nowrap; }
.captionCell {
  max-width: 360px;
  cursor: pointer;
  line-height: 1.5;
}
.captionCell:hover { background: #fafafa; }
.captionFull {
  white-space: pre-wrap;
  word-break: break-word;
}
.num { text-align: right; color: #444; white-space: nowrap; }
.date { color: #888; white-space: nowrap; }
.tags { color: #888; font-size: 12px; }

.linkBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #f4f4f9;
  color: #5B5FC7;
  text-decoration: none;
  font-size: 14px;
}
.linkBtn:hover { background: #e8e8f5; }

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  font-size: 13px;
  color: #666;
}
.pager button {
  border: 1px solid #ddd;
  background: white;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.pager button:disabled { opacity: 0.4; cursor: not-allowed; }
.pager button:hover:not(:disabled) { background: #f8f8f8; }

.state {
  text-align: center;
  padding: 32px;
  color: #888;
}
```

- [ ] **Step 3: API_BASE_URL export 확인**

```bash
grep -n "API_BASE_URL\|export" frontend/packages/erp/src/api/client.ts | head
```
없으면 client.ts에 export 추가 필요. 있으면 OK.

(주의: client.ts의 baseURL 상수가 다른 이름이면 import 줄을 그에 맞게 조정)

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag
git commit -m "feat: 도길록 — 인스타 해시태그 수집기 페이지 컴포넌트"
```

---

## Task 8: DoGilrok 라우팅 + 사이드바 메뉴 등록

**Files:**
- Modify: `frontend/packages/erp/src/pages/FDE/DoGilrok/index.tsx` (Routes 컨테이너로 변환)
- Create: `frontend/packages/erp/src/pages/FDE/DoGilrok/Home.tsx` (기존 placeholder 분리)
- Modify: `frontend/packages/erp/src/config/menuConfig.ts:23-29` (도길록 메뉴 항목 추가)

- [ ] **Step 1: Home.tsx로 placeholder 분리**

[frontend/packages/erp/src/pages/FDE/DoGilrok/Home.tsx](frontend/packages/erp/src/pages/FDE/DoGilrok/Home.tsx) 신규:

```tsx
import s from './DoGilrok.module.css';

export default function DoGilrokHome() {
  return (
    <div className={s.container}>
      <h1 className={s.title}>도길록</h1>
      <p className={s.team}>DX기획팀</p>
      <div className={s.placeholder}>
        <span style={{ fontFamily: 'Tossface', fontSize: 48 }}>&#x1F4AA;</span>
        <p>여기에 내 기능을 만들어보세요!</p>
        <p className={s.hint}>이 파일을 수정하거나, 이 폴더에 새 페이지를 추가하세요.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: index.tsx를 Routes 컨테이너로 교체**

[frontend/packages/erp/src/pages/FDE/DoGilrok/index.tsx](frontend/packages/erp/src/pages/FDE/DoGilrok/index.tsx) 전체 교체:

```tsx
import { Routes, Route } from 'react-router-dom';
import DoGilrokHome from './Home';
import InstaHashtagPage from './InstaHashtag';

export default function DoGilrok() {
  return (
    <Routes>
      <Route index element={<DoGilrokHome />} />
      <Route path="insta-hashtag" element={<InstaHashtagPage />} />
    </Routes>
  );
}
```

- [ ] **Step 3: menuConfig.ts에 인스타 메뉴 항목 추가**

[frontend/packages/erp/src/config/menuConfig.ts:26-28](frontend/packages/erp/src/config/menuConfig.ts#L26-L28) 의 `items` 블록을 다음으로 교체:

```typescript
    items: [
      { label: '도길록', to: '/fde/do-gilrok' },
      { label: '인스타 해시태그', to: '/fde/do-gilrok/insta-hashtag' },
    ],
```

- [ ] **Step 4: dev 서버에서 시각 검증**

```bash
cd frontend && pnpm dev:erp
```
브라우저에서:
1. 로그인
2. 사이드바 → 도길록 → "인스타 해시태그" 메뉴 클릭
3. 페이지 렌더링 확인 (등록 해시태그/즉석 수집/누적 게시물 섹션 보이는지)
4. 아직 백엔드는 dev 환경에 없을 수 있으므로 API 에러는 정상 (404가 떠도 페이지 자체는 보여야 함)

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/erp/src/pages/FDE/DoGilrok frontend/packages/erp/src/config/menuConfig.ts
git commit -m "feat: 도길록 — 인스타 해시태그 메뉴 + 라우팅 등록"
```

---

## Task 9: PR 생성 및 배포

**Files:**
- N/A (배포 워크플로우)

- [ ] **Step 1: 현재 브랜치에서 PR 생성**

```bash
git push -u origin HEAD
gh pr create --title "feat: 도길록 — 인스타 해시태그 수집기" --body "$(cat <<'EOF'
## Summary
- 소연쌤이 노가다로 모으던 인스타 해시태그 게시물을 자동 수집하는 페이지
- `instagrapi`(인스타 비공식 API) + 버너 계정으로 매일 새벽 4시 자동 수집
- `#팀버핏`, `#TEAMBUTFIT` 디폴트 등록
- 페이지: `/fde/do-gilrok/insta-hashtag`
- 즉석 수집 / 누적 검색 / CSV 다운로드 지원

## EC2 사전 작업 필요 (PR 머지 전 또는 직후)
- `pip install instagrapi==2.1.3`
- `/etc/fde/insta_credentials.env` 작성 (INSTA_USERNAME, INSTA_PASSWORD)
- systemd 서비스 EnvironmentFile에 위 경로 추가 (또는 fde-backend의 .env에 직접)
- `/etc/fde/insta_session.json` 디렉토리 권한 (uvicorn 실행 유저 쓰기 가능)

## Test plan
- [ ] 사이드바 → 도길록 → 인스타 해시태그 진입
- [ ] 등록 해시태그 추가/삭제/토글
- [ ] 즉석 수집 (`#팀버핏`, 30개) → 결과 메시지 + 테이블에 게시물 누적
- [ ] 검색/정렬/필터/페이징 동작
- [ ] CSV 다운로드 → 엑셀에서 한글 정상 표시

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: PR 자동 체크 통과 확인**

```bash
gh pr checks
```
실패 시 로그 확인 후 수정.

- [ ] **Step 3: 머지 후 자동 배포 대기 (~3분)**

GitHub Actions의 fde-backend deploy + frontend deploy 완료 대기.

- [ ] **Step 4: EC2에서 instagrapi 설치 + 환경변수 세팅**

(아래 "EC2 작업" 섹션 참조 — 운영자(길록쌤)가 직접 수행)

- [ ] **Step 5: 운영 검증**

```bash
# health check
curl -s https://fde.butfitvolt.click/fde-api/health | jq

# 해시태그 목록 (인증 필요 — 브라우저에서 페이지로 검증 권장)
```
브라우저에서 페이지 들어가서:
1. `#팀버핏` 즉석 수집 버튼 → 30~60초 후 결과 확인
2. 누적 게시물 테이블에 게시물 표시되는지

---

## EC2 작업 (길록쌤)

PR 머지 후 EC2에서 다음 작업:

1. **instagrapi 설치**
   ```bash
   ssh fde-ec2  # 또는 운영자 접속 방식대로
   cd /var/www/fde-backend  # 또는 실제 backend 디렉토리
   source venv/bin/activate  # venv 사용한다면
   pip install instagrapi==2.1.3
   ```

2. **버너 계정 환경변수 등록**

   기존 fde-backend `.env` 파일에 추가:
   ```
   INSTA_USERNAME=gilrokdo@butfitseoul.com
   INSTA_PASSWORD=123456a!
   INSTA_SESSION_PATH=/etc/fde/insta_session.json
   ```

   세션 디렉토리 준비:
   ```bash
   sudo mkdir -p /etc/fde
   sudo chown <uvicorn실행유저>:<group> /etc/fde
   sudo chmod 700 /etc/fde
   ```

3. **systemd 재시작**
   ```bash
   sudo systemctl restart fde-backend
   sudo systemctl is-active fde-backend  # active 확인
   journalctl -u fde-backend -n 50 --no-pager  # 마이그레이션 로그 확인 ([마이그레이션] 적용 완료 ✓)
   ```

4. **첫 수집 테스트**

   브라우저에서 `/fde/do-gilrok/insta-hashtag` → "즉석 수집" `#팀버핏` 30개 → 60초 정도 기다림 → 결과 확인.

   에러 시: `journalctl -u fde-backend -f` 로 로그 모니터링.

5. **새벽 4시 cron 자동 실행 확인 (다음날)**

   다음날 09시쯤:
   ```bash
   journalctl -u fde-backend --since "today 03:50" | grep insta
   ```
   `[insta] #팀버핏 수집 완료 — 신규 N, 갱신 M, X.Xs` 로그 보여야 함.

---

## Self-Review (작성 후 점검)

- ✅ Spec 모든 요구사항 커버: 등록/즉석/누적/CSV/cron
- ✅ DB upsert 로직: ON CONFLICT + matched_tags 누적 로직 정확
- ✅ 타입 일치: 백엔드 응답 필드 ↔ 프론트 타입 정의 일치
- ✅ 인증 처리: `/fde-api/dogilrok/insta/*`는 기본 auth_middleware 적용 (exempt에 없음)
- ✅ 비밀번호: 환경변수만 사용, 코드/git 노출 없음
- ⚠️ 알려진 한계: 즉석 수집은 동기 실행. 100개 이상 요청하면 HTTP timeout 가능 → limit 100 cap으로 방어
