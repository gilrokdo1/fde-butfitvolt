import os
import time
from typing import Any

import requests
from fastapi import APIRouter

from utils.db import safe_db

router = APIRouter()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")

_cache: dict[str, Any] = {}
_cache_ts: float = 0
CACHE_TTL = 300


def _github_headers():
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _get_member_github_map() -> dict[str, str]:
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

    pr_resp = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/pulls",
        headers=_github_headers(),
        params={"state": "all", "per_page": 100},
        timeout=15,
    )
    prs = pr_resp.json() if pr_resp.status_code == 200 else []

    commit_resp = requests.get(
        f"https://api.github.com/repos/{GITHUB_REPO}/commits",
        headers=_github_headers(),
        params={"per_page": 100},
        timeout=15,
    )
    commits = commit_resp.json() if commit_resp.status_code == 200 else []

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
