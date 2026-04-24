"""이예원 — 버핏그라운드 예산관리 (Phase 0 스캐폴드)

전체 스펙: frontend/packages/erp/src/pages/LeeYewon/budget/docs/
Phase 0에서는 health check + 마스터 조회(지점/카테고리)만 제공.
지출·예산 CRUD는 Phase 1에서 추가.
"""

from fastapi import APIRouter

from utils.db import safe_db

router = APIRouter()


@router.get("/health")
def health():
    """DB 연결 + 시드 데이터 진입 여부 확인용. 배포 직후 검증 엔드포인트.

    반환: 지점/카테고리 수와 신도림(파일럿 대상) 활성화 여부.
    """
    with safe_db("fde") as (conn, cur):
        cur.execute("SELECT COUNT(*) AS n FROM yewon_branches")
        branches = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM yewon_account_categories")
        categories = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM yewon_account_codes")
        codes = cur.fetchone()["n"]
        cur.execute("SELECT is_active FROM yewon_branches WHERE code = 'sindorim'")
        sindorim = cur.fetchone()
    return {
        "ok": True,
        "phase": 0,
        "branches": branches,
        "categories": categories,
        "account_codes": codes,
        "sindorim_active": bool(sindorim and sindorim["is_active"]),
    }


@router.get("/branches")
def list_branches():
    """지점 목록. display_order 오름차순(오픈일 순)."""
    with safe_db("fde") as (conn, cur):
        cur.execute(
            """
            SELECT id, code, name, display_order, is_active
            FROM yewon_branches
            ORDER BY display_order
            """
        )
        return [dict(r) for r in cur.fetchall()]


@router.get("/categories")
def list_categories():
    """대카테고리 + 소카테고리 계층 구조로 반환."""
    with safe_db("fde") as (conn, cur):
        cur.execute(
            """
            SELECT id, code, name, display_order, is_pending, is_fixed_cost
            FROM yewon_account_categories
            ORDER BY display_order
            """
        )
        cats = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, category_id, code, name, display_order, is_active
            FROM yewon_account_codes
            WHERE is_active = TRUE
            ORDER BY display_order
            """
        )
        codes_by_cat: dict[int, list] = {}
        for r in cur.fetchall():
            codes_by_cat.setdefault(r["category_id"], []).append(dict(r))

    for c in cats:
        c["codes"] = codes_by_cat.get(c["id"], [])
    return cats
