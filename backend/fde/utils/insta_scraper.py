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
            cl.get_timeline_feed()
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
    """is_active=true 해시태그 모두 순회 수집 (cron용)."""
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
