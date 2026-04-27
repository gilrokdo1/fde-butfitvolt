"""이예원 — 버핏그라운드 예산관리 (Phase 0 + Phase 1)

전체 스펙: frontend/packages/erp/src/pages/LeeYewon/budget/docs/
Phase 0: 마스터 조회 (지점/카테고리)
Phase 1: 지출 CRUD + 품목 자동완성 + 중복 감지 + 품목 마스터 자동 누적
예산 집계/대시보드/이관은 Phase 2+.
"""

from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from utils.db import safe_db

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# 공통 헬퍼
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_user(cur, request: Request) -> int:
    """JWT payload에서 유저 정보 꺼내 yewon_budget_users에 upsert → id 반환.

    FDE 로그인 payload 예시: {"user_id": 123, "name": "이예원", ...}
    이관 작성자(박영준 등)는 name-only로 별도 시드되고, 로그인 유저는 여기서 자동 생성.
    """
    user = getattr(request.state, "user", None) or {}
    butfit_user_id = user.get("user_id") or user.get("id")
    name = (user.get("name") or "").strip()
    if not butfit_user_id or not name:
        raise HTTPException(401, "인증 정보가 불완전합니다")

    cur.execute(
        "SELECT id FROM yewon_budget_users WHERE butfit_user_id = %s",
        (butfit_user_id,),
    )
    row = cur.fetchone()
    if row:
        return row["id"]

    # 같은 이름이 있으면(이관 데이터 작성자) butfit_user_id 채워주기
    cur.execute(
        "SELECT id FROM yewon_budget_users WHERE name = %s AND butfit_user_id IS NULL",
        (name,),
    )
    row = cur.fetchone()
    if row:
        cur.execute(
            "UPDATE yewon_budget_users SET butfit_user_id = %s, updated_at = NOW() WHERE id = %s",
            (butfit_user_id, row["id"]),
        )
        return row["id"]

    # 새로 생성
    cur.execute(
        """
        INSERT INTO yewon_budget_users (name, butfit_user_id, role)
        VALUES (%s, %s, 'branch_staff')
        RETURNING id
        """,
        (name, butfit_user_id),
    )
    return cur.fetchone()["id"]


def _user_can_edit_branch(cur, user_id: int, branch_id: int) -> bool:
    """해당 유저가 이 지점 지출을 편집할 수 있는가.

    현재 파일럿: branch_staff role인데 user_branch_memberships에 매칭 없어도 허용
    (멤버십 시드 전). 추후 엄격 모드로 전환.
    """
    cur.execute(
        "SELECT role FROM yewon_budget_users WHERE id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    if not row:
        return False
    role = row["role"]
    # GM/SGM은 전체 편집 가능
    if role in ("hq_gm", "hq_sgm"):
        return True
    # branch_staff: 소속 지점만. 소속 없으면 TRUE (파일럿 한정 관대 모드)
    cur.execute(
        "SELECT 1 FROM yewon_user_branch_memberships WHERE user_id = %s",
        (user_id,),
    )
    memberships = cur.fetchall()
    if not memberships:
        return True
    cur.execute(
        """
        SELECT 1 FROM yewon_user_branch_memberships
        WHERE user_id = %s AND branch_id = %s
        """,
        (user_id, branch_id),
    )
    return cur.fetchone() is not None


def _upsert_product_catalog(cur, branch_id: int, expense: dict):
    """지출 등록/수정 시 품목 마스터 자동 누적.

    이관 데이터(is_migrated=TRUE)도 호출 가능하지만 order_count를 +1씩 정확히 반영.
    """
    cur.execute(
        """
        INSERT INTO yewon_product_catalog
            (branch_id, name, default_unit_price, default_account_code_id,
             default_url, default_note, order_count, last_ordered_at)
        VALUES (%s, %s, %s, %s, %s, %s, 1, NOW())
        ON CONFLICT (branch_id, name) DO UPDATE SET
            default_unit_price = EXCLUDED.default_unit_price,
            default_account_code_id = EXCLUDED.default_account_code_id,
            default_url = COALESCE(EXCLUDED.default_url, yewon_product_catalog.default_url),
            default_note = COALESCE(EXCLUDED.default_note, yewon_product_catalog.default_note),
            order_count = yewon_product_catalog.order_count + 1,
            last_ordered_at = NOW(),
            updated_at = NOW()
        """,
        (
            branch_id,
            expense["item_name"].strip(),
            expense["unit_price"],
            expense["account_code_id"],
            expense.get("receipt_url"),
            expense.get("note"),
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 마스터 조회 (Phase 0)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
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
        "phase": 1,
        "branches": branches,
        "categories": categories,
        "account_codes": codes,
        "sindorim_active": bool(sindorim and sindorim["is_active"]),
    }


@router.get("/branches")
def list_branches():
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


# ─────────────────────────────────────────────────────────────────────────────
# 품목 자동완성 (Phase 1)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/branches/{branch_id}/products")
def autocomplete_products(branch_id: int, q: str = "", limit: int = 10):
    """품목 자동완성. 지점별 마스터에서 LIKE 검색.

    q: 2자 이상부터 의미 있음. 빈 문자열이면 빈 배열 반환.
    """
    q = q.strip()
    if len(q) < 2:
        return []
    if limit < 1 or limit > 30:
        limit = 10

    with safe_db("fde") as (conn, cur):
        cur.execute(
            """
            SELECT pc.id, pc.name, pc.default_unit_price, pc.default_account_code_id,
                   pc.default_url, pc.default_note, pc.order_count, pc.last_ordered_at,
                   ac.name AS default_account_code_name
            FROM yewon_product_catalog pc
            LEFT JOIN yewon_account_codes ac ON ac.id = pc.default_account_code_id
            WHERE pc.branch_id = %s AND pc.name ILIKE %s
            ORDER BY pc.order_count DESC, pc.last_ordered_at DESC NULLS LAST
            LIMIT %s
            """,
            (branch_id, f"%{q}%", limit),
        )
        return [dict(r) for r in cur.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# 지출 CRUD (Phase 1)
# ─────────────────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    branch_id: int
    account_code_id: int
    order_date: date
    accounting_year: int = Field(ge=2020, le=2100)
    accounting_month: int = Field(ge=1, le=12)
    item_name: str = Field(min_length=1, max_length=200)
    unit_price: int = Field(ge=0)
    quantity: int = Field(ge=1)
    shipping_fee: int = Field(ge=0, default=0)
    note: str | None = None
    receipt_url: str | None = None
    is_long_delivery: bool = False
    # 미정 카테고리 플로우
    is_pending: bool = False
    pending_reason: str | None = None
    # 중복 감지 우회 확인 (3회째 등록 시 프론트에서 True로 재전송)
    confirm_duplicate: bool = False


class ExpenseUpdate(BaseModel):
    account_code_id: int | None = None
    order_date: date | None = None
    accounting_year: int | None = Field(default=None, ge=2020, le=2100)
    accounting_month: int | None = Field(default=None, ge=1, le=12)
    item_name: str | None = Field(default=None, min_length=1, max_length=200)
    unit_price: int | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=1)
    shipping_fee: int | None = Field(default=None, ge=0)
    note: str | None = None
    receipt_url: str | None = None
    is_long_delivery: bool | None = None


class RefundRequest(BaseModel):
    refunded_amount: int = Field(ge=1)
    refund_reason: str = Field(min_length=1)


class ReceiptConfirmRequest(BaseModel):
    confirmed: bool


def _validate_accounting_month(order_date: date, acc_year: int, acc_month: int):
    """귀속월이 현재 기준 합리적 범위인지 검증.

    - 너무 과거(5개월 이상)는 경고 대상이지만 DB상 불가 아님 → 여기선 허용
    - 미래는 한 달 뒤까지만 허용
    """
    today = date.today()
    target = date(acc_year, acc_month, 1)
    current = date(today.year, today.month, 1)
    # 한 달 뒤 1일까지 허용
    if target.year * 12 + target.month > current.year * 12 + current.month + 1:
        raise HTTPException(400, "귀속월은 다음 달까지만 등록할 수 있습니다")


def _check_duplicate(cur, branch_id: int, payload: ExpenseCreate, user_id: int) -> int:
    """같은 조건의 지출이 오늘 몇 건 등록됐는지 반환.

    기준: 같은 지점, 같은 order_date, 같은 item_name(trim+casefold),
         같은 unit_price, 같은 quantity, 같은 created_by.
    이관 데이터는 감지 제외 (신규 등록만 대상).
    """
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM yewon_expenses
        WHERE branch_id = %s
          AND order_date = %s
          AND LOWER(TRIM(item_name)) = LOWER(TRIM(%s))
          AND unit_price = %s
          AND quantity = %s
          AND created_by = %s
          AND is_migrated = FALSE
          AND deleted_at IS NULL
        """,
        (
            branch_id,
            payload.order_date,
            payload.item_name,
            payload.unit_price,
            payload.quantity,
            user_id,
        ),
    )
    return cur.fetchone()["n"]


@router.get("/branches/{branch_id}/expenses")
def list_expenses(
    branch_id: int,
    year: int | None = None,
    month: int | None = None,
    account_code_id: int | None = None,
    include_pending: bool = True,
    limit: int = 500,
):
    """지점별 지출 목록. 최신순.

    기본은 귀속월 필터 없음(전체). month 주면 해당 월만.
    """
    if limit < 1 or limit > 2000:
        limit = 500

    where = ["e.branch_id = %s", "e.deleted_at IS NULL"]
    params: list = [branch_id]
    if year is not None:
        where.append("e.accounting_year = %s")
        params.append(year)
    if month is not None:
        where.append("e.accounting_month = %s")
        params.append(month)
    if account_code_id is not None:
        where.append("e.account_code_id = %s")
        params.append(account_code_id)
    if not include_pending:
        where.append("e.is_pending = FALSE")

    sql = f"""
        SELECT e.id, e.branch_id, e.account_code_id, ac.name AS account_code_name,
               e.status, e.order_date, e.accounting_year, e.accounting_month,
               e.receipt_confirmed, e.receipt_confirmed_at, e.is_long_delivery,
               e.created_by, u.name AS created_by_name,
               e.item_name, e.unit_price, e.quantity, e.shipping_fee, e.total_amount,
               e.note, e.receipt_url,
               e.is_pending, e.pending_reason,
               e.refunded_amount, e.refund_reason,
               e.is_migrated, e.created_at, e.updated_at
        FROM yewon_expenses e
        LEFT JOIN yewon_account_codes ac ON ac.id = e.account_code_id
        LEFT JOIN yewon_budget_users u ON u.id = e.created_by
        WHERE {' AND '.join(where)}
        ORDER BY e.order_date DESC, e.id DESC
        LIMIT %s
    """
    params.append(limit)

    with safe_db("fde") as (conn, cur):
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


@router.post("/expenses")
def create_expense(request: Request, payload: ExpenseCreate):
    """지출 신규 등록."""
    _validate_accounting_month(payload.order_date, payload.accounting_year, payload.accounting_month)

    # "미정" 선택 시 pending_reason 필수
    if payload.is_pending and not (payload.pending_reason or "").strip():
        raise HTTPException(400, "미정 카테고리는 사유 입력이 필수입니다")

    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        if not _user_can_edit_branch(cur, user_id, payload.branch_id):
            raise HTTPException(403, "해당 지점에 지출을 등록할 권한이 없습니다")

        # account_code 존재 검증 (pending 플래그와 일치하는지)
        cur.execute(
            """
            SELECT ac.id, c.is_pending
            FROM yewon_account_codes ac
            JOIN yewon_account_categories c ON c.id = ac.category_id
            WHERE ac.id = %s
            """,
            (payload.account_code_id,),
        )
        ac = cur.fetchone()
        if not ac:
            raise HTTPException(400, "존재하지 않는 카테고리입니다")
        if bool(ac["is_pending"]) != payload.is_pending:
            raise HTTPException(400, "카테고리와 is_pending 플래그가 일치하지 않습니다")

        # 중복 감지 (3회째부터)
        dup_count = _check_duplicate(cur, payload.branch_id, payload, user_id)
        if dup_count >= 2 and not payload.confirm_duplicate:
            # 3회째(= 이미 2건 + 이번 1건) 등록 시도 → 409로 프론트에 확인 요청
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "duplicate_warning",
                    "message": f"오늘 이 품목을 이미 {dup_count}번 등록했습니다. 중복이 아닌지 확인하세요.",
                    "existing_count": dup_count,
                },
            )

        total_amount = payload.unit_price * payload.quantity + payload.shipping_fee

        cur.execute(
            """
            INSERT INTO yewon_expenses (
                branch_id, account_code_id, status, order_date,
                accounting_year, accounting_month, receipt_confirmed,
                created_by, item_name, unit_price, quantity, shipping_fee,
                total_amount, note, receipt_url, is_long_delivery,
                is_pending, pending_reason
            ) VALUES (
                %s, %s, 'completed', %s,
                %s, %s, FALSE,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s
            )
            RETURNING id
            """,
            (
                payload.branch_id, payload.account_code_id, payload.order_date,
                payload.accounting_year, payload.accounting_month,
                user_id, payload.item_name.strip(), payload.unit_price,
                payload.quantity, payload.shipping_fee,
                total_amount, payload.note, payload.receipt_url,
                payload.is_long_delivery,
                payload.is_pending, payload.pending_reason,
            ),
        )
        new_id = cur.fetchone()["id"]

        # 중복 확인 로그 (3회째 강행시)
        if dup_count >= 2 and payload.confirm_duplicate:
            cur.execute(
                """
                INSERT INTO yewon_duplicate_warnings (expense_id, warning_count)
                VALUES (%s, %s)
                """,
                (new_id, dup_count + 1),
            )

        # 품목 마스터 자동 누적 (미정 카테고리는 스킵 — 기본 카테고리 잘못 잡히면 안되므로)
        if not payload.is_pending:
            _upsert_product_catalog(cur, payload.branch_id, {
                "item_name": payload.item_name,
                "unit_price": payload.unit_price,
                "account_code_id": payload.account_code_id,
                "receipt_url": payload.receipt_url,
                "note": payload.note,
            })

    return {"ok": True, "id": new_id}


@router.patch("/expenses/{expense_id}")
def update_expense(request: Request, expense_id: int, payload: ExpenseUpdate):
    """지출 수정. status/branch_id/created_by 등은 변경 불가."""
    fields: dict = {}
    for name in (
        "account_code_id", "order_date", "accounting_year", "accounting_month",
        "item_name", "unit_price", "quantity", "shipping_fee",
        "note", "receipt_url", "is_long_delivery",
    ):
        val = getattr(payload, name)
        if val is not None:
            fields[name] = val.strip() if isinstance(val, str) and name == "item_name" else val

    if not fields:
        raise HTTPException(400, "수정할 항목이 없습니다")

    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        cur.execute(
            "SELECT branch_id, deleted_at, status FROM yewon_expenses WHERE id = %s",
            (expense_id,),
        )
        row = cur.fetchone()
        if not row or row["deleted_at"] is not None:
            raise HTTPException(404, "지출을 찾을 수 없습니다")
        if not _user_can_edit_branch(cur, user_id, row["branch_id"]):
            raise HTTPException(403, "해당 지점 지출을 수정할 권한이 없습니다")

        # 귀속월이 바뀌면 검증
        if "accounting_year" in fields or "accounting_month" in fields:
            cur.execute(
                "SELECT order_date, accounting_year, accounting_month FROM yewon_expenses WHERE id = %s",
                (expense_id,),
            )
            cur_row = cur.fetchone()
            _validate_accounting_month(
                fields.get("order_date", cur_row["order_date"]),
                fields.get("accounting_year", cur_row["accounting_year"]),
                fields.get("accounting_month", cur_row["accounting_month"]),
            )

        set_parts = [f"{k} = %s" for k in fields]
        # total_amount는 unit_price/quantity/shipping_fee 변경 시 재계산
        needs_recalc = any(k in fields for k in ("unit_price", "quantity", "shipping_fee"))
        if needs_recalc:
            set_parts.append(
                "total_amount = COALESCE(%s, unit_price) * COALESCE(%s, quantity) + COALESCE(%s, shipping_fee)"
            )
        set_parts.append("updated_at = NOW()")

        values = list(fields.values())
        if needs_recalc:
            values.extend([
                fields.get("unit_price"),
                fields.get("quantity"),
                fields.get("shipping_fee"),
            ])
        values.append(expense_id)

        cur.execute(
            f"UPDATE yewon_expenses SET {', '.join(set_parts)} WHERE id = %s",
            values,
        )

    return {"ok": True}


@router.delete("/expenses/{expense_id}")
def delete_expense(request: Request, expense_id: int, reason: str = ""):
    """Soft delete."""
    if not reason.strip():
        raise HTTPException(400, "삭제 사유는 필수입니다")

    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        cur.execute(
            "SELECT branch_id, deleted_at FROM yewon_expenses WHERE id = %s",
            (expense_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "지출을 찾을 수 없습니다")
        if row["deleted_at"] is not None:
            raise HTTPException(400, "이미 삭제된 지출입니다")
        if not _user_can_edit_branch(cur, user_id, row["branch_id"]):
            raise HTTPException(403, "해당 지점 지출을 삭제할 권한이 없습니다")

        cur.execute(
            """
            UPDATE yewon_expenses
            SET deleted_at = NOW(), deleted_by = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (user_id, expense_id),
        )
    return {"ok": True}


@router.post("/expenses/{expense_id}/refund")
def refund_expense(request: Request, expense_id: int, payload: RefundRequest):
    """환불 처리 — 부분/전액."""
    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        cur.execute(
            """
            SELECT branch_id, total_amount, refunded_amount, status, deleted_at
            FROM yewon_expenses WHERE id = %s
            """,
            (expense_id,),
        )
        row = cur.fetchone()
        if not row or row["deleted_at"] is not None:
            raise HTTPException(404, "지출을 찾을 수 없습니다")
        if row["status"] != "completed":
            raise HTTPException(400, "이미 환불 처리된 지출은 다시 환불할 수 없습니다")
        if payload.refunded_amount > row["total_amount"]:
            raise HTTPException(400, "환불 금액이 지출 총액을 초과할 수 없습니다")
        if not _user_can_edit_branch(cur, user_id, row["branch_id"]):
            raise HTTPException(403, "해당 지점 지출을 환불할 권한이 없습니다")

        new_status = (
            "fully_refunded" if payload.refunded_amount == row["total_amount"]
            else "partially_refunded"
        )
        cur.execute(
            """
            UPDATE yewon_expenses SET
                status = %s,
                refunded_amount = %s,
                refund_reason = %s,
                refunded_at = NOW(),
                refunded_by = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (new_status, payload.refunded_amount, payload.refund_reason, user_id, expense_id),
        )

    return {"ok": True, "status": new_status}


@router.post("/expenses/{expense_id}/refund/cancel")
def cancel_refund(request: Request, expense_id: int):
    """환불 취소 — completed로 복귀."""
    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        cur.execute(
            "SELECT branch_id, status, deleted_at FROM yewon_expenses WHERE id = %s",
            (expense_id,),
        )
        row = cur.fetchone()
        if not row or row["deleted_at"] is not None:
            raise HTTPException(404, "지출을 찾을 수 없습니다")
        if row["status"] == "completed":
            raise HTTPException(400, "환불 처리되지 않은 지출입니다")
        if not _user_can_edit_branch(cur, user_id, row["branch_id"]):
            raise HTTPException(403, "해당 지점 지출을 수정할 권한이 없습니다")

        cur.execute(
            """
            UPDATE yewon_expenses SET
                status = 'completed', refunded_amount = 0,
                refund_reason = NULL, refunded_at = NULL, refunded_by = NULL,
                updated_at = NOW()
            WHERE id = %s
            """,
            (expense_id,),
        )
    return {"ok": True}


@router.patch("/expenses/{expense_id}/receipt")
def toggle_receipt_confirmed(request: Request, expense_id: int, payload: ReceiptConfirmRequest):
    """수령 확인 토글."""
    with safe_db("fde") as (conn, cur):
        user_id = _get_or_create_user(cur, request)
        cur.execute(
            "SELECT branch_id, deleted_at FROM yewon_expenses WHERE id = %s",
            (expense_id,),
        )
        row = cur.fetchone()
        if not row or row["deleted_at"] is not None:
            raise HTTPException(404, "지출을 찾을 수 없습니다")
        if not _user_can_edit_branch(cur, user_id, row["branch_id"]):
            raise HTTPException(403, "해당 지점 지출을 수정할 권한이 없습니다")

        cur.execute(
            """
            UPDATE yewon_expenses SET
                receipt_confirmed = %s,
                receipt_confirmed_at = CASE WHEN %s THEN NOW() ELSE NULL END,
                updated_at = NOW()
            WHERE id = %s
            """,
            (payload.confirmed, payload.confirmed, expense_id),
        )
    return {"ok": True, "confirmed": payload.confirmed}


# ─────────────────────────────────────────────────────────────────────────────
# 이관 (Phase 2) — 신도림 1~4월 CSV → DB 일괄 INSERT
#
# 설계:
# - 프론트에서 로컬 파싱한 JSON을 통째로 POST
# - 권한: 이예원님 본인만 (JWT name == "이예원")
# - 재실행 방지: 해당 지점에 is_migrated=TRUE 레코드가 있으면 409
# - 단일 트랜잭션: 한 건이라도 실패하면 전부 롤백
# - 이관 데이터는 receipt_confirmed=TRUE, is_migrated=TRUE, 감사/중복 감지 대상 외
# - 작성자 이름은 yewon_budget_users name-only 레코드로 upsert
# ─────────────────────────────────────────────────────────────────────────────

class BudgetRowInput(BaseModel):
    account_name: str = Field(min_length=1, max_length=100)
    months: dict[str, int]  # {"1": 330000, ... "12": 330000}


class BudgetBlockInput(BaseModel):
    year: int = Field(ge=2020, le=2100)
    rows: list[BudgetRowInput]


class ExpenseMigrateInput(BaseModel):
    order_date: date
    accounting_year: int = Field(ge=2020, le=2100)
    accounting_month: int = Field(ge=1, le=12)
    created_by_name: str = Field(min_length=1, max_length=50)
    account_name: str | None = None  # None이면 is_pending=TRUE
    item_name: str = Field(min_length=1, max_length=200)
    unit_price: int = Field(ge=0)
    quantity: int = Field(ge=1)
    shipping_fee: int = Field(ge=0, default=0)
    note: str | None = None
    receipt_url: str | None = None
    is_pending: bool = False
    pending_reason: str | None = None


class MigrateRequest(BaseModel):
    branch_code: str = Field(min_length=1)
    budget: BudgetBlockInput
    expenses: list[ExpenseMigrateInput]


def _ensure_owner(request: Request):
    """이관은 이예원님만 실행 가능."""
    user = getattr(request.state, "user", None) or {}
    name = (user.get("name") or "").strip()
    if name != "이예원":
        raise HTTPException(403, "이관은 이예원 본인만 실행할 수 있습니다")


@router.get("/migrate/{branch_code}/status")
def migration_status(branch_code: str):
    """이미 이관된 지점인지 확인."""
    with safe_db("fde") as (conn, cur):
        cur.execute("SELECT id FROM yewon_branches WHERE code = %s", (branch_code,))
        br = cur.fetchone()
        if not br:
            raise HTTPException(404, "지점을 찾을 수 없습니다")
        branch_id = br["id"]

        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE is_migrated = TRUE AND deleted_at IS NULL) AS migrated_expenses,
                COUNT(*) FILTER (WHERE is_migrated = FALSE AND deleted_at IS NULL) AS manual_expenses
            FROM yewon_expenses WHERE branch_id = %s
            """,
            (branch_id,),
        )
        counts = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS n FROM yewon_annual_budgets WHERE branch_id = %s",
            (branch_id,),
        )
        budget_count = cur.fetchone()["n"]

    return {
        "branch_code": branch_code,
        "migrated_expenses": counts["migrated_expenses"],
        "manual_expenses": counts["manual_expenses"],
        "annual_budget_rows": budget_count,
        "ready": counts["migrated_expenses"] == 0 and budget_count == 0,
    }


@router.post("/migrate/{branch_code}")
def run_migration(branch_code: str, request: Request, payload: MigrateRequest):
    """신도림 등 지점별 1~4월 CSV 이관 실행. 재실행 방지 + 단일 트랜잭션."""
    _ensure_owner(request)

    if payload.branch_code != branch_code:
        raise HTTPException(400, "branch_code 불일치")

    with safe_db("fde") as (conn, cur):
        # 1. 지점 조회
        cur.execute(
            "SELECT id, name FROM yewon_branches WHERE code = %s",
            (branch_code,),
        )
        br = cur.fetchone()
        if not br:
            raise HTTPException(404, f"지점 '{branch_code}'을(를) 찾을 수 없습니다")
        branch_id = br["id"]
        branch_name = br["name"]

        # 2. 재실행 방지 (is_migrated 레코드 또는 annual_budgets 이미 존재)
        cur.execute(
            """
            SELECT COUNT(*) AS n FROM yewon_expenses
            WHERE branch_id = %s AND is_migrated = TRUE AND deleted_at IS NULL
            """,
            (branch_id,),
        )
        if cur.fetchone()["n"] > 0:
            raise HTTPException(409, f"{branch_name}은(는) 이미 이관되어 있습니다")

        cur.execute(
            "SELECT COUNT(*) AS n FROM yewon_annual_budgets WHERE branch_id = %s",
            (branch_id,),
        )
        if cur.fetchone()["n"] > 0:
            raise HTTPException(409, f"{branch_name}의 예산이 이미 등록되어 있습니다")

        # 3. 이관 실행자 자동 등록
        actor_id = _get_or_create_user(cur, request)

        # 4. 카테고리 이름 → id 매핑
        cur.execute("SELECT id, name FROM yewon_account_codes")
        codes_by_name = {r["name"]: r["id"] for r in cur.fetchall()}
        pending_id = codes_by_name.get("미정")
        if not pending_id:
            raise HTTPException(500, "'미정' 소카테고리 시드가 없습니다")

        # 5. 예산 입력
        budget_inserted = 0
        missing_accounts: list[str] = []
        for row in payload.budget.rows:
            code_id = codes_by_name.get(row.account_name)
            if not code_id:
                missing_accounts.append(row.account_name)
                continue
            for m_str, amount in row.months.items():
                try:
                    m = int(m_str)
                except ValueError:
                    continue
                if m < 1 or m > 12 or amount <= 0:
                    continue
                cur.execute(
                    """
                    INSERT INTO yewon_annual_budgets
                        (branch_id, account_code_id, year, month, amount, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (branch_id, account_code_id, year, month) DO NOTHING
                    """,
                    (branch_id, code_id, payload.budget.year, m, amount, actor_id),
                )
                budget_inserted += cur.rowcount

        if missing_accounts:
            raise HTTPException(
                400,
                f"매칭되지 않은 예산 카테고리: {missing_accounts}",
            )

        # 6. 작성자 이름들을 budget_users에 name-only 시드
        writer_names = sorted({e.created_by_name for e in payload.expenses})
        writer_id_map: dict[str, int] = {}
        for nm in writer_names:
            cur.execute(
                "SELECT id FROM yewon_budget_users WHERE name = %s",
                (nm,),
            )
            row = cur.fetchone()
            if row:
                writer_id_map[nm] = row["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO yewon_budget_users (name, butfit_user_id, role)
                    VALUES (%s, NULL, 'branch_staff')
                    RETURNING id
                    """,
                    (nm,),
                )
                writer_id_map[nm] = cur.fetchone()["id"]

        # 7. 지출 일괄 INSERT
        expense_inserted = 0
        pending_inserted = 0
        account_missing: list[str] = []

        for e in payload.expenses:
            if e.is_pending:
                code_id = pending_id
                pending_inserted += 1
            else:
                if not e.account_name:
                    raise HTTPException(400, f"account_name 누락: {e.item_name}")
                code_id = codes_by_name.get(e.account_name)
                if not code_id:
                    account_missing.append(e.account_name)
                    continue

            total_amount = e.unit_price * e.quantity + e.shipping_fee
            cur.execute(
                """
                INSERT INTO yewon_expenses (
                    branch_id, account_code_id, status, order_date,
                    accounting_year, accounting_month,
                    receipt_confirmed, receipt_confirmed_at,
                    created_by, item_name, unit_price, quantity, shipping_fee,
                    total_amount, note, receipt_url,
                    is_pending, pending_reason,
                    is_migrated, migrated_at
                ) VALUES (
                    %s, %s, 'completed', %s,
                    %s, %s,
                    TRUE, NOW(),
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s,
                    TRUE, NOW()
                )
                """,
                (
                    branch_id, code_id, e.order_date,
                    e.accounting_year, e.accounting_month,
                    writer_id_map[e.created_by_name],
                    e.item_name.strip(), e.unit_price, e.quantity, e.shipping_fee,
                    total_amount, e.note, e.receipt_url,
                    e.is_pending, e.pending_reason,
                ),
            )
            expense_inserted += 1

        if account_missing:
            # 이미 여러 건 INSERT 했지만 트랜잭션이 아직 열려있어 아래 raise로 롤백됨
            raise HTTPException(
                400,
                f"매칭되지 않은 지출 카테고리: {sorted(set(account_missing))}",
            )

    return {
        "ok": True,
        "branch": branch_name,
        "budget_rows_inserted": budget_inserted,
        "expenses_inserted": expense_inserted,
        "pending_expenses": pending_inserted,
        "writers_registered": len(writer_names),
    }


@router.get("/branches/{branch_id}/validate")
def validate_branch(branch_id: int, year: int):
    """월별·카테고리별 지출 합계 반환. 시트 대시보드와 대조용."""
    with safe_db("fde") as (conn, cur):
        cur.execute(
            """
            SELECT accounting_month AS month,
                   ac.name AS account_name,
                   SUM(total_amount - refunded_amount) AS total,
                   COUNT(*) AS count
            FROM yewon_expenses e
            JOIN yewon_account_codes ac ON ac.id = e.account_code_id
            WHERE e.branch_id = %s AND e.accounting_year = %s
              AND e.deleted_at IS NULL AND e.is_pending = FALSE
            GROUP BY accounting_month, ac.name
            ORDER BY accounting_month, ac.name
            """,
            (branch_id, year),
        )
        by_month_cat = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT accounting_month AS month,
                   SUM(total_amount - refunded_amount) AS total,
                   COUNT(*) AS count
            FROM yewon_expenses
            WHERE branch_id = %s AND accounting_year = %s
              AND deleted_at IS NULL AND is_pending = FALSE
            GROUP BY accounting_month
            ORDER BY accounting_month
            """,
            (branch_id, year),
        )
        by_month = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT ac.name AS account_name,
                   SUM(e.total_amount - e.refunded_amount) AS total,
                   COUNT(*) AS count
            FROM yewon_expenses e
            JOIN yewon_account_codes ac ON ac.id = e.account_code_id
            WHERE e.branch_id = %s AND e.accounting_year = %s
              AND e.deleted_at IS NULL AND e.is_pending = FALSE
            GROUP BY ac.name
            ORDER BY ac.name
            """,
            (branch_id, year),
        )
        by_cat = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT COUNT(*) AS n, SUM(total_amount - refunded_amount) AS total
            FROM yewon_expenses
            WHERE branch_id = %s AND accounting_year = %s
              AND deleted_at IS NULL AND is_pending = TRUE
            """,
            (branch_id, year),
        )
        pending_row = cur.fetchone()

    return {
        "year": year,
        "by_month": by_month,
        "by_category": by_cat,
        "by_month_category": by_month_cat,
        "pending": {
            "count": pending_row["n"] or 0,
            "total": int(pending_row["total"]) if pending_row["total"] else 0,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 고정비 이관 (세탁·미화·기본급) — 시트 "2. VAT+ 블록"에만 있는 월별 청구액
# 기존 /migrate와 달리 이미 이관된 지점에도 추가 이관 허용.
# (재실행 방지는 동일 account+year+month 조합으로 체크)
# ─────────────────────────────────────────────────────────────────────────────

class FixedCostInput(BaseModel):
    order_date: date
    accounting_year: int = Field(ge=2020, le=2100)
    accounting_month: int = Field(ge=1, le=12)
    account_name: str = Field(min_length=1, max_length=100)
    item_name: str = Field(min_length=1, max_length=200)
    unit_price: int = Field(ge=1)
    quantity: int = Field(ge=1, default=1)
    shipping_fee: int = Field(ge=0, default=0)
    note: str | None = None
    receipt_url: str | None = None


class FixedCostMigrateRequest(BaseModel):
    branch_code: str = Field(min_length=1)
    fixed_costs: list[FixedCostInput]


_FIXED_COST_ACCOUNTS = {"세탁", "미화", "기본급"}


@router.post("/migrate/{branch_code}/fixed-costs")
def run_fixed_cost_migration(
    branch_code: str,
    request: Request,
    payload: FixedCostMigrateRequest,
):
    """세탁·미화·기본급 월별 청구액 이관. 중복은 month 단위로 감지."""
    _ensure_owner(request)

    if payload.branch_code != branch_code:
        raise HTTPException(400, "branch_code 불일치")

    # 화이트리스트 — 고정비 3종만 허용
    for fc in payload.fixed_costs:
        if fc.account_name not in _FIXED_COST_ACCOUNTS:
            raise HTTPException(
                400,
                f"'{fc.account_name}'은 고정비 이관 대상이 아닙니다. 허용: {sorted(_FIXED_COST_ACCOUNTS)}",
            )

    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT id, name FROM yewon_branches WHERE code = %s",
            (branch_code,),
        )
        br = cur.fetchone()
        if not br:
            raise HTTPException(404, f"지점 '{branch_code}'을(를) 찾을 수 없습니다")
        branch_id = br["id"]
        branch_name = br["name"]

        actor_id = _get_or_create_user(cur, request)

        cur.execute(
            "SELECT id, name FROM yewon_account_codes WHERE name = ANY(%s)",
            (list(_FIXED_COST_ACCOUNTS),),
        )
        codes_by_name = {r["name"]: r["id"] for r in cur.fetchall()}
        missing = _FIXED_COST_ACCOUNTS - set(codes_by_name)
        if missing:
            raise HTTPException(500, f"고정비 카테고리 시드 누락: {sorted(missing)}")

        inserted = 0
        skipped_existing: list[str] = []

        for fc in payload.fixed_costs:
            code_id = codes_by_name[fc.account_name]

            # 같은 지점·계정·연월 고정비 이관 레코드가 이미 있는지 체크
            cur.execute(
                """
                SELECT id FROM yewon_expenses
                WHERE branch_id = %s
                  AND account_code_id = %s
                  AND accounting_year = %s
                  AND accounting_month = %s
                  AND is_migrated = TRUE
                  AND deleted_at IS NULL
                """,
                (branch_id, code_id, fc.accounting_year, fc.accounting_month),
            )
            if cur.fetchone():
                skipped_existing.append(
                    f"{fc.account_name} {fc.accounting_year}-{fc.accounting_month:02d}"
                )
                continue

            total_amount = fc.unit_price * fc.quantity + fc.shipping_fee
            cur.execute(
                """
                INSERT INTO yewon_expenses (
                    branch_id, account_code_id, status, order_date,
                    accounting_year, accounting_month,
                    receipt_confirmed, receipt_confirmed_at,
                    created_by, item_name, unit_price, quantity, shipping_fee,
                    total_amount, note, receipt_url,
                    is_pending, is_migrated, migrated_at
                ) VALUES (
                    %s, %s, 'completed', %s,
                    %s, %s,
                    TRUE, NOW(),
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    FALSE, TRUE, NOW()
                )
                """,
                (
                    branch_id, code_id, fc.order_date,
                    fc.accounting_year, fc.accounting_month,
                    actor_id, fc.item_name.strip(), fc.unit_price,
                    fc.quantity, fc.shipping_fee,
                    total_amount, fc.note, fc.receipt_url,
                ),
            )
            inserted += 1

    return {
        "ok": True,
        "branch": branch_name,
        "fixed_costs_inserted": inserted,
        "skipped_existing": skipped_existing,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 대시보드 집계 (Phase 3)
#
# 반환 구조:
# {
#   year, month,
#   month_progress: { days_passed, days_total, ratio },  # 경과율 (오늘까지)
#   totals: { monthly_budget, monthly_spend, quarterly_budget, quarterly_spend, ... },
#   accounts: [
#     {
#       account_code_id, account_name, category_name, is_fixed_cost,
#       month_budget,   # 원 예산(해당 월) + 해당 월의 전용 조정
#       month_spend,
#       month_ratio,    # month_spend / month_budget
#       quarter_budget, # 분기 3개월 원예산 + 분기 추경 + 분기 내 월 전용 합
#       quarter_spend,
#       quarter_ratio,
#       quarter_remaining,
#     }
#   ],
#   quarter: { index (1~4), done (1Q 마감 시 true) }
# }
# ─────────────────────────────────────────────────────────────────────────────

def _month_progress(year: int, month: int) -> dict:
    """오늘 기준, 해당 월의 경과율."""
    from datetime import date as _date, timedelta
    today = _date.today()
    if month == 12:
        last = _date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = _date(year, month + 1, 1) - timedelta(days=1)
    days_total = last.day
    if today.year * 12 + today.month < year * 12 + month:
        days_passed = 0
    elif today.year * 12 + today.month > year * 12 + month:
        days_passed = days_total
    else:
        days_passed = today.day
    ratio = (days_passed / days_total) if days_total else 0
    return {"days_passed": days_passed, "days_total": days_total, "ratio": round(ratio, 4)}


@router.get("/branches/{branch_id}/dashboard")
def dashboard(branch_id: int, year: int, month: int):
    """지점 월별 대시보드 집계.

    계산 근거 (business-rules.md § 1):
    - 실질 예산 = 원예산 + (해당 월의 전용 조정) + (해당 월이 속한 분기의 추경/전용)
    - 실지출 = SUM(total - refunded) WHERE deleted_at IS NULL AND is_pending=FALSE
    """
    if month < 1 or month > 12:
        raise HTTPException(400, "month는 1~12")

    quarter = (month - 1) // 3 + 1
    q_months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3]

    with safe_db("fde") as (conn, cur):
        cur.execute(
            "SELECT id, name FROM yewon_branches WHERE id = %s",
            (branch_id,),
        )
        br = cur.fetchone()
        if not br:
            raise HTTPException(404, "지점을 찾을 수 없습니다")

        # 1) 활성 소카테고리 전체 (is_pending=FALSE만 — 미정은 대시보드 집계 제외)
        cur.execute(
            """
            SELECT ac.id AS account_code_id, ac.name AS account_name,
                   c.name AS category_name, c.is_fixed_cost
            FROM yewon_account_codes ac
            JOIN yewon_account_categories c ON c.id = ac.category_id
            WHERE ac.is_active = TRUE AND c.is_pending = FALSE
            ORDER BY c.display_order, ac.display_order
            """,
        )
        accounts = [dict(r) for r in cur.fetchall()]
        account_ids = [a["account_code_id"] for a in accounts]

        if not account_ids:
            return {
                "year": year, "month": month, "quarter": quarter,
                "month_progress": _month_progress(year, month),
                "accounts": [], "totals": {}, "pending": {"count": 0, "total": 0},
            }

        # 2) 원예산: 해당 월 + 해당 분기 3개월
        cur.execute(
            """
            SELECT account_code_id, month, amount
            FROM yewon_annual_budgets
            WHERE branch_id = %s AND year = %s AND month = ANY(%s)
            """,
            (branch_id, year, q_months),
        )
        budget_rows = cur.fetchall()
        budget_month: dict[int, int] = {}          # account_code_id → 해당 월 원예산
        budget_quarter: dict[int, int] = {}        # account_code_id → 분기 원예산 합
        for r in budget_rows:
            if r["month"] == month:
                budget_month[r["account_code_id"]] = r["amount"]
            budget_quarter[r["account_code_id"]] = budget_quarter.get(r["account_code_id"], 0) + r["amount"]

        # 3) 조정: 해당 월 전용 + 분기 추경/전용
        cur.execute(
            """
            SELECT account_code_id, adjustment_amount, quarter, month
            FROM yewon_budget_adjustments
            WHERE branch_id = %s AND year = %s
              AND (quarter = %s OR month = ANY(%s))
            """,
            (branch_id, year, quarter, q_months),
        )
        adj_month: dict[int, int] = {}
        adj_quarter: dict[int, int] = {}
        for r in cur.fetchall():
            acc_id = r["account_code_id"]
            # 분기 단위 조정은 분기 실질예산에만 더해짐
            if r["quarter"] is not None:
                adj_quarter[acc_id] = adj_quarter.get(acc_id, 0) + r["adjustment_amount"]
            # 월 단위 조정
            if r["month"] == month:
                adj_month[acc_id] = adj_month.get(acc_id, 0) + r["adjustment_amount"]
            if r["month"] is not None and r["month"] in q_months:
                adj_quarter[acc_id] = adj_quarter.get(acc_id, 0) + r["adjustment_amount"]

        # 4) 실지출: 해당 월 + 분기 3개월
        cur.execute(
            """
            SELECT account_code_id, accounting_month,
                   SUM(total_amount - refunded_amount) AS total
            FROM yewon_expenses
            WHERE branch_id = %s AND accounting_year = %s
              AND accounting_month = ANY(%s)
              AND deleted_at IS NULL AND is_pending = FALSE
            GROUP BY account_code_id, accounting_month
            """,
            (branch_id, year, q_months),
        )
        spend_month: dict[int, int] = {}
        spend_quarter: dict[int, int] = {}
        for r in cur.fetchall():
            acc_id = r["account_code_id"]
            total = int(r["total"] or 0)
            if r["accounting_month"] == month:
                spend_month[acc_id] = total
            spend_quarter[acc_id] = spend_quarter.get(acc_id, 0) + total

        # 5) 미정 집계 (분리 표시용)
        cur.execute(
            """
            SELECT accounting_month,
                   SUM(total_amount - refunded_amount) AS total, COUNT(*) AS n
            FROM yewon_expenses
            WHERE branch_id = %s AND accounting_year = %s
              AND accounting_month = %s
              AND deleted_at IS NULL AND is_pending = TRUE
            GROUP BY accounting_month
            """,
            (branch_id, year, month),
        )
        pending_row = cur.fetchone()

        # 6) 계정별 조립
        account_rows = []
        month_budget_total = month_spend_total = 0
        quarter_budget_total = quarter_spend_total = 0
        for a in accounts:
            acc_id = a["account_code_id"]
            mb = budget_month.get(acc_id, 0) + adj_month.get(acc_id, 0)
            ms = spend_month.get(acc_id, 0)
            qb = budget_quarter.get(acc_id, 0) + adj_quarter.get(acc_id, 0)
            qs = spend_quarter.get(acc_id, 0)
            account_rows.append({
                **a,
                "month_budget": mb,
                "month_spend": ms,
                "month_ratio": round(ms / mb, 4) if mb > 0 else 0,
                "quarter_budget": qb,
                "quarter_spend": qs,
                "quarter_ratio": round(qs / qb, 4) if qb > 0 else 0,
                "quarter_remaining": qb - qs,
            })
            month_budget_total += mb
            month_spend_total += ms
            quarter_budget_total += qb
            quarter_spend_total += qs

        # 7) 이전 분기 마감 요약 (있으면)
        prev_quarter = quarter - 1
        prev_summary = None
        if prev_quarter >= 1:
            prev_months = [prev_quarter * 3 - 2, prev_quarter * 3 - 1, prev_quarter * 3]
            cur.execute(
                """
                SELECT ac.id AS account_code_id, ac.name AS account_name,
                       COALESCE(b.budget, 0) AS budget,
                       COALESCE(s.spend, 0) AS spend
                FROM yewon_account_codes ac
                JOIN yewon_account_categories c ON c.id = ac.category_id
                LEFT JOIN (
                    SELECT account_code_id, SUM(amount) AS budget
                    FROM yewon_annual_budgets
                    WHERE branch_id = %s AND year = %s AND month = ANY(%s)
                    GROUP BY account_code_id
                ) b ON b.account_code_id = ac.id
                LEFT JOIN (
                    SELECT account_code_id, SUM(total_amount - refunded_amount) AS spend
                    FROM yewon_expenses
                    WHERE branch_id = %s AND accounting_year = %s AND accounting_month = ANY(%s)
                      AND deleted_at IS NULL AND is_pending = FALSE
                    GROUP BY account_code_id
                ) s ON s.account_code_id = ac.id
                WHERE ac.is_active = TRUE AND c.is_pending = FALSE
                  AND (b.budget IS NOT NULL OR s.spend IS NOT NULL)
                ORDER BY ac.display_order
                """,
                (branch_id, year, prev_months, branch_id, year, prev_months),
            )
            over_rows = []
            for r in cur.fetchall():
                budget = int(r["budget"] or 0)
                spend = int(r["spend"] or 0)
                if budget and spend > budget:
                    over_rows.append({
                        "account_name": r["account_name"],
                        "over_amount": spend - budget,
                    })
            prev_summary = {"quarter": prev_quarter, "over_budget": over_rows}

        return {
            "year": year,
            "month": month,
            "quarter": quarter,
            "quarter_months": q_months,
            "month_progress": _month_progress(year, month),
            "accounts": account_rows,
            "totals": {
                "month_budget": month_budget_total,
                "month_spend": month_spend_total,
                "month_remaining": month_budget_total - month_spend_total,
                "month_ratio": round(month_spend_total / month_budget_total, 4) if month_budget_total else 0,
                "quarter_budget": quarter_budget_total,
                "quarter_spend": quarter_spend_total,
                "quarter_remaining": quarter_budget_total - quarter_spend_total,
            },
            "pending": {
                "count": pending_row["n"] if pending_row else 0,
                "total": int(pending_row["total"]) if pending_row and pending_row["total"] else 0,
            },
            "previous_quarter": prev_summary,
        }
