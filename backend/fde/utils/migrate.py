"""
DB 자동 마이그레이션 유틸리티
- 백엔드 시작 시 schema.sql을 FDE DB에 자동 적용
- CREATE TABLE IF NOT EXISTS 이므로 중복 실행해도 안전
"""
import os
import logging
from pathlib import Path

import psycopg2

logger = logging.getLogger(__name__)

# schema.sql 경로: backend/fde/schema.sql
_SCHEMA_PATH = Path(__file__).parent.parent / "schema.sql"


def run_migrations():
    """FDE DB에 schema.sql을 적용한다. 이미 존재하는 테이블은 건드리지 않는다."""
    if not _SCHEMA_PATH.exists():
        logger.warning(f"[마이그레이션] schema.sql을 찾을 수 없음: {_SCHEMA_PATH}")
        return

    schema_sql = _SCHEMA_PATH.read_text(encoding="utf-8")

    try:
        conn = psycopg2.connect(
            host=os.getenv("FDE_DB_HOST", "localhost"),
            port=int(os.getenv("FDE_DB_PORT", "5432")),
            dbname=os.getenv("FDE_DB_NAME", "fde"),
            user=os.getenv("FDE_DB_USER", "fde"),
            password=os.getenv("FDE_DB_PASSWORD"),
            connect_timeout=10,
        )
        with conn:
            with conn.cursor() as cur:
                cur.execute(schema_sql)
        conn.close()
        logger.info("[마이그레이션] schema.sql 적용 완료 ✓")
    except Exception as e:
        # 마이그레이션 실패해도 서버가 뜨긴 해야 하므로 예외를 삼킨다
        logger.error(f"[마이그레이션] 실패 — {e}")
