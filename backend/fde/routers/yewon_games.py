"""이예원 — 미니게임천국 게임 스코어 기록 + 랭킹"""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.db import safe_db

router = APIRouter()

ALLOWED_GAMES = {"plane", "tetris"}


class ScoreSubmit(BaseModel):
    game: str
    score: int
    meta: dict[str, Any] | None = None


def _ensure_table():
    """yewon_game_scores 테이블 자동 생성"""
    with safe_db("fde") as (conn, cur):
        cur.execute("""
            CREATE TABLE IF NOT EXISTS yewon_game_scores (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                user_photo TEXT,
                game VARCHAR(40) NOT NULL,
                score INT NOT NULL,
                meta JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS yewon_game_scores_rank_idx "
            "ON yewon_game_scores (game, score DESC)"
        )


@router.post("/scores")
def submit_score(request: Request, body: ScoreSubmit):
    if body.game not in ALLOWED_GAMES:
        raise HTTPException(400, f"지원하지 않는 게임: {body.game}")
    if body.score < 0:
        raise HTTPException(400, "점수는 0 이상이어야 합니다")

    user = getattr(request.state, "user", None) or {}
    user_id = user.get("user_id") or user.get("id")
    user_name = user.get("name")
    if not user_id or not user_name:
        raise HTTPException(401, "인증 정보가 없습니다")

    user_photo = user.get("photo_100px_uri") or user.get("photo_400px_uri")

    _ensure_table()
    import json
    with safe_db("fde") as (conn, cur):
        cur.execute(
            """
            INSERT INTO yewon_game_scores (user_id, user_name, user_photo, game, score, meta)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (user_id, user_name, user_photo, body.game, body.score,
             json.dumps(body.meta) if body.meta else None),
        )
        row = cur.fetchone()
    return {"ok": True, "id": row["id"], "created_at": row["created_at"]}


@router.get("/scores/{game}")
def top_scores(game: str, limit: int = 10):
    if game not in ALLOWED_GAMES and game != "all":
        raise HTTPException(400, f"지원하지 않는 게임: {game}")
    if limit < 1 or limit > 50:
        limit = 10

    _ensure_table()
    with safe_db("fde") as (conn, cur):
        if game == "all":
            # 게임별 Top 1씩 묶어서 반환 (전체 랭킹 요약용)
            cur.execute(
                """
                WITH ranked AS (
                    SELECT
                        game, user_id, user_name, user_photo, score, meta, created_at,
                        ROW_NUMBER() OVER (PARTITION BY game, user_id ORDER BY score DESC) AS rn
                    FROM yewon_game_scores
                )
                SELECT game, user_id, user_name, user_photo, score, meta, created_at
                FROM ranked
                WHERE rn = 1
                ORDER BY game, score DESC
                """
            )
            return [dict(r) for r in cur.fetchall()]

        # 특정 게임 — 사용자별 최고점 기준 Top N
        cur.execute(
            """
            WITH best AS (
                SELECT user_id, MAX(score) AS best_score
                FROM yewon_game_scores
                WHERE game = %s
                GROUP BY user_id
            )
            SELECT s.user_id, s.user_name, s.user_photo, s.score, s.meta, s.created_at
            FROM yewon_game_scores s
            INNER JOIN best b
              ON s.user_id = b.user_id AND s.score = b.best_score
            WHERE s.game = %s
            ORDER BY s.score DESC, s.created_at ASC
            LIMIT %s
            """,
            (game, game, limit),
        )
        # 동점인 경우 먼저 기록한 사람 우선
        rows = [dict(r) for r in cur.fetchall()]
        # user_id 중복 제거 (best_score가 여러 번 기록된 경우)
        seen = set()
        unique = []
        for r in rows:
            if r["user_id"] in seen:
                continue
            seen.add(r["user_id"])
            unique.append(r)
        return unique[:limit]
