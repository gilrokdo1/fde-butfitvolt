"""
DB 자동 마이그레이션 유틸리티
- 백엔드 시작 시 schema.sql을 FDE DB에 자동 적용
- 적용 범위: CREATE TABLE/INDEX IF NOT EXISTS 만 의도. ALTER/DROP 등 파괴적 DDL은
  schema.sql에 추가하지 말 것 (배포 즉시 프로덕션 DB에 반영됨)
- DB 연결은 utils.db._get_conn("fde") 재사용 (코드베이스 단일 DB 설정 경로)
"""
import logging
from pathlib import Path

from utils.db import _get_conn

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent.parent / "schema.sql"


def run_migrations():
    """FDE DB에 schema.sql을 적용한다. CREATE ... IF NOT EXISTS 전제."""
    if not _SCHEMA_PATH.exists():
        logger.warning(f"[마이그레이션] schema.sql을 찾을 수 없음: {_SCHEMA_PATH}")
        return

    schema_sql = _SCHEMA_PATH.read_text(encoding="utf-8")

    try:
        conn = _get_conn("fde")
        with conn:
            with conn.cursor() as cur:
                cur.execute(schema_sql)
        conn.close()
        logger.info("[마이그레이션] schema.sql 적용 완료 ✓")
    except Exception as e:
        # 마이그레이션 실패해도 서버가 뜨긴 해야 하므로 예외를 삼킨다
        logger.error(f"[마이그레이션] 실패 — {e}")
