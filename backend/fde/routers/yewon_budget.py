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
