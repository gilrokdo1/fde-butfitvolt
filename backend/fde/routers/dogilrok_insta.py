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
    buf.write("\ufeff")
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
