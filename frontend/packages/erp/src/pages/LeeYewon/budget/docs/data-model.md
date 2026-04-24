# Data Model

> 버핏그라운드 지점 예산 관리 시스템의 데이터 모델 명세.
> 이 문서는 DB 스키마의 Single Source of Truth이며, 마이그레이션 작성 시 그대로 반영한다.

---

## 0. 컨벤션

- **DB**: PostgreSQL (프로덕션) / SQLite (개발). 문법 차이는 Alembic이 흡수.
- **ID**: 모든 테이블의 PK는 `id BIGSERIAL` (PostgreSQL) / `INTEGER PRIMARY KEY AUTOINCREMENT` (SQLite).
- **타임스탬프**: 모든 테이블에 `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE, default now()).
- **금액**: `BIGINT` (원 단위, VAT 포함). 소수점 사용 안 함. VAT- 값은 계산으로 도출.
- **날짜**: 날짜만 필요하면 `DATE`, 시각 포함이면 `TIMESTAMPTZ`.
- **Soft delete**: `deleted_at TIMESTAMPTZ NULL` + `deleted_by BIGINT NULL`. 실제 DELETE는 감사 로그 정리 시에만.
- **JSONB**: 감사 로그의 before/after 스냅샷은 JSONB.
- **명명**: 테이블은 snake_case 복수형, 컬럼도 snake_case.

---

## 1. 테이블 목록

| 분류 | 테이블 | 용도 |
|---|---|---|
| **조직** | `branches` | 지점 마스터 |
| | `users` | 사용자 계정 |
| | `user_branch_memberships` | 사용자-지점 소속 관계 |
| **카테고리** | `account_categories` | 대카테고리 (경상 소모품, 세탁, 미화, 미정 등 7개) |
| | `account_codes` | 소카테고리 (샤워실/탈의실, 데스크/백오피스 등) |
| **예산** | `annual_budgets` | 지점 × 소카테고리 × 월별 원 예산 |
| | `budget_revision_history` | 원 예산 수정 이력 |
| | `budget_adjustments` | 추경 + 카테고리 전용 |
| **지출** | `expenses` | 지출 핵심 테이블 |
| | `product_catalog` | 품목 마스터 (지점별 자주 쓰는 품목) |
| **부가** | `duplicate_warnings` | 중복 경고 로그 |
| | `notifications` | 시스템 알림 기록 |
| | `audit_logs` | 모든 변경의 감사 로그 |

총 13개 테이블.

---

## 2. 조직 도메인

### 2-1. `branches`

지점 마스터. 시스템 오픈 시점에 12개 레코드로 시작.

```sql
CREATE TABLE branches (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(20)  NOT NULL UNIQUE,     -- 'sindorim', 'gangnam' 등 영문 키
  name              VARCHAR(50)  NOT NULL,            -- '신도림', '강남' 등 표기명
  display_order     INTEGER      NOT NULL DEFAULT 0,  -- 리스트 노출 순서
  opened_at         DATE         NULL,                -- 지점 오픈일 (분석용)
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_branches_active ON branches (is_active) WHERE is_active = TRUE;
```

**시드 데이터** (12개)
- sindorim / 신도림
- gangnam / 강남
- hongdae / 홍대
- jamsil / 잠실
- gundae / 건대
- seongsu / 성수
- mokdong / 목동
- yeoksam / 역삼
- sillim / 신림
- hapjeong / 합정
- suyu / 수유
- nowon / 노원

실제 지점 리스트는 운영팀 확인 후 확정.

### 2-2. `users`

사용자 계정. branch_staff부터 GM까지 전부 단일 테이블.

```sql
CREATE TABLE users (
  id                BIGSERIAL PRIMARY KEY,
  email             VARCHAR(255) NOT NULL UNIQUE,
  name              VARCHAR(50)  NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(30)  NOT NULL,            -- 'branch_staff' | 'hq_pm' | 'hq_sgm' | 'hq_gm' | 'hq_planning_lead'
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ  NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_users_role CHECK (role IN (
    'branch_staff', 'hq_pm', 'hq_sgm', 'hq_gm', 'hq_planning_lead'
  ))
);

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_active ON users (is_active) WHERE is_active = TRUE;
```

**Role 설명**
- `branch_staff`: 지점 직원. `user_branch_memberships`로 소속 지점 지정.
- `hq_pm`: 본사 PM. 전체 조회 전담.
- `hq_sgm`: 본사 SGM. 카테고리 재분류, 타 지점 수정 등 운영 개입 권한.
- `hq_gm`: 본사 GM. 예산/추경/마스터 전권.
- `hq_planning_lead`: 운영기획팀 팀장. 카테고리 전용 승인 권한.

본사 role은 지점 소속이 없음 (`user_branch_memberships` 레코드 없음).

### 2-3. `user_branch_memberships`

지점 직원의 소속 지점 지정. 1명이 여러 지점 소속 가능 (매니저급).

```sql
CREATE TABLE user_branch_memberships (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id         BIGINT       NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (user_id, branch_id)
);

CREATE INDEX idx_ubm_user ON user_branch_memberships (user_id);
CREATE INDEX idx_ubm_branch ON user_branch_memberships (branch_id);
```

**규칙**
- `branch_staff` role의 user만 이 테이블에 레코드 가짐.
- 본사 role은 레코드 없음 (`expense.read.all_branches` 권한으로 전체 접근).

---

## 3. 카테고리 도메인

### 3-1. `account_categories`

대카테고리. 7개 고정 (경상 소모품, 비경상 소모품, 기타 비용, 세탁, 미화, 파트 인건비, **미정**).

```sql
CREATE TABLE account_categories (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(30)  NOT NULL UNIQUE,     -- 'operating_supplies' 등
  name              VARCHAR(50)  NOT NULL,            -- '경상 소모품' 등
  display_order     INTEGER      NOT NULL DEFAULT 0,
  is_pending        BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE: "미정" 카테고리 (특수)
  is_fixed_cost     BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE: 세탁/미화/인건비 (고정비 성격)
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

**시드 데이터**

| code | name | is_pending | is_fixed_cost |
|---|---|---|---|
| operating_supplies | 경상 소모품 | FALSE | FALSE |
| non_operating_supplies | 비경상 소모품 | FALSE | FALSE |
| other_expenses | 기타 비용 | FALSE | FALSE |
| laundry | 세탁 | FALSE | TRUE |
| cleaning_service | 미화 | FALSE | TRUE |
| part_time_labor | 파트 인건비 | FALSE | TRUE |
| pending | 미정 | TRUE | FALSE |

**"미정" 카테고리 특수 규칙**
- 월별 예산 집계에서 **제외** (소진율 계산에 포함 안 함).
- 본사 뷰에 "미정 대기 목록" 별도 섹션.
- 재분류 완료 시 `expenses.category_code_id`가 정식 카테고리로 변경되며 집계에 편입.

### 3-2. `account_codes`

소카테고리. 대카테고리별로 1~N개. 총 10~11개 (미정 카테고리는 자체 소카테고리 없이 직접 사용 가능).

```sql
CREATE TABLE account_codes (
  id                  BIGSERIAL PRIMARY KEY,
  category_id         BIGINT       NOT NULL REFERENCES account_categories(id),
  code                VARCHAR(50)  NOT NULL UNIQUE,   -- 'shower_locker' 등
  name                VARCHAR(100) NOT NULL,          -- '샤워실/탈의실' 등
  display_order       INTEGER      NOT NULL DEFAULT 0,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_codes_category ON account_codes (category_id);
CREATE INDEX idx_account_codes_active ON account_codes (is_active) WHERE is_active = TRUE;
```

**시드 데이터**

| category | code | name |
|---|---|---|
| operating_supplies | desk_backoffice | 데스크/백오피스 |
| operating_supplies | shower_locker | 샤워실/탈의실 |
| operating_supplies | cleaning_supplies | 청소/미화 소모품 |
| operating_supplies | bg_tools | (BG) 소도구/기구소모품/가구 |
| non_operating_supplies | towels_uniforms | 수건/운동복 |
| other_expenses | member_rewards | 회원 리워드 |
| other_expenses | transport | 운반비 |
| laundry | laundry_service | 세탁 |
| cleaning_service | cleaning_operation | 미화 |
| part_time_labor | base_salary | 기본급 |
| pending | pending_uncategorized | 미정 |

---

## 4. 예산 도메인

### 4-1. `annual_budgets`

지점 × 소카테고리 × 연-월별 **원 예산** (VAT+ 기준). 추경은 별도 테이블.

```sql
CREATE TABLE annual_budgets (
  id                  BIGSERIAL PRIMARY KEY,
  branch_id           BIGINT       NOT NULL REFERENCES branches(id),
  account_code_id     BIGINT       NOT NULL REFERENCES account_codes(id),
  year                INTEGER      NOT NULL,
  month               INTEGER      NOT NULL,           -- 1~12
  amount              BIGINT       NOT NULL DEFAULT 0, -- 원 단위, VAT+
  is_locked           BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE: 연말 마감 후 편집 불가
  created_by          BIGINT       NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (branch_id, account_code_id, year, month),
  CONSTRAINT chk_annual_budgets_month CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT chk_annual_budgets_amount CHECK (amount >= 0)
);

CREATE INDEX idx_annual_budgets_branch_year ON annual_budgets (branch_id, year);
CREATE INDEX idx_annual_budgets_lookup ON annual_budgets (branch_id, year, month);
```

**규모 예측**
- 12지점 × 10소카테고리 × 12개월 = 1,440 레코드 / 년
- 연간 예산 변경은 드물며, 변경 시 `budget_revision_history`에 기록.

### 4-2. `budget_revision_history`

원 예산 수정 이력. GM이 `annual_budgets`를 수정할 때마다 기록.

```sql
CREATE TABLE budget_revision_history (
  id                  BIGSERIAL PRIMARY KEY,
  annual_budget_id    BIGINT       NOT NULL REFERENCES annual_budgets(id),
  old_amount          BIGINT       NOT NULL,
  new_amount          BIGINT       NOT NULL,
  reason              TEXT         NOT NULL,
  revised_by          BIGINT       NOT NULL REFERENCES users(id),
  revised_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_brh_budget ON budget_revision_history (annual_budget_id);
CREATE INDEX idx_brh_user ON budget_revision_history (revised_by);
```

### 4-3. `budget_adjustments`

추경 + 카테고리 전용 통합 테이블. 원 예산은 건드리지 않고, 이 테이블에 누적되는 조정값이 "실질 예산"을 만듦.

```sql
CREATE TABLE budget_adjustments (
  id                    BIGSERIAL PRIMARY KEY,
  branch_id             BIGINT       NOT NULL REFERENCES branches(id),
  account_code_id       BIGINT       NOT NULL REFERENCES account_codes(id),
  year                  INTEGER      NOT NULL,
  quarter               INTEGER      NULL,              -- 1~4 (추경 단위는 분기)
  month                 INTEGER      NULL,              -- 1~12 (카테고리 전용은 월 단위일 수 있음)
  adjustment_type       VARCHAR(30)  NOT NULL,          -- 'supplementary' | 'transfer_out' | 'transfer_in'
  adjustment_amount     BIGINT       NOT NULL,          -- supplementary/transfer_in: 양수, transfer_out: 음수
  reason                TEXT         NOT NULL,
  flex_approval_ref     VARCHAR(100) NULL,              -- Flex 결재번호 등 외부 참조
  transfer_pair_id      BIGINT       NULL REFERENCES budget_adjustments(id),  -- 전용 시 짝 레코드 FK
  source_account_code_id  BIGINT     NULL REFERENCES account_codes(id),  -- 전용 시 출처
  target_account_code_id  BIGINT     NULL REFERENCES account_codes(id),  -- 전용 시 대상
  original_expense_id   BIGINT       NULL REFERENCES expenses(id),      -- 초과 원인 지출 (선택)
  created_by            BIGINT       NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_ba_type CHECK (adjustment_type IN ('supplementary', 'transfer_out', 'transfer_in')),
  CONSTRAINT chk_ba_quarter CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4),
  CONSTRAINT chk_ba_month CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  CONSTRAINT chk_ba_pair_required CHECK (
    (adjustment_type = 'supplementary') OR
    (adjustment_type IN ('transfer_out','transfer_in') AND transfer_pair_id IS NOT NULL)
  )
);

CREATE INDEX idx_ba_branch_year ON budget_adjustments (branch_id, year);
CREATE INDEX idx_ba_lookup ON budget_adjustments (branch_id, account_code_id, year, quarter);
CREATE INDEX idx_ba_pair ON budget_adjustments (transfer_pair_id);
```

**사용 패턴**

**추경 (supplementary)**
- 단일 레코드, `adjustment_type = 'supplementary'`
- `adjustment_amount`: 양수 (증액)
- `flex_approval_ref`: Flex 결재번호
- 추경은 분기 단위 (`quarter` 사용)

**카테고리 전용 (transfer)**
- 짝을 이루는 2개 레코드 동시 생성
- 출처: `adjustment_type = 'transfer_out'`, `adjustment_amount` 음수
- 대상: `adjustment_type = 'transfer_in'`, `adjustment_amount` 양수
- 두 레코드 모두 같은 `transfer_pair_id` 공유
- `source_account_code_id`, `target_account_code_id`로 양방향 추적

**실질 예산 계산**
```sql
-- 특정 지점·카테고리·월의 실질 예산
SELECT
  ab.amount +
  COALESCE((
    SELECT SUM(adjustment_amount)
    FROM budget_adjustments
    WHERE branch_id = ab.branch_id
      AND account_code_id = ab.account_code_id
      AND year = ab.year
      AND (
        (quarter IS NOT NULL AND quarter = CEIL(ab.month / 3.0))
        OR (month IS NOT NULL AND month = ab.month)
      )
  ), 0) AS effective_budget
FROM annual_budgets ab
WHERE ab.branch_id = :branch_id
  AND ab.account_code_id = :account_code_id
  AND ab.year = :year
  AND ab.month = :month;
```

---

## 5. 지출 도메인

### 5-1. `expenses`

시스템의 핵심 테이블. 시트 13개 필드 + 상태 관리 + 이관/환불 필드.

```sql
CREATE TABLE expenses (
  id                    BIGSERIAL PRIMARY KEY,

  -- 소속
  branch_id             BIGINT       NOT NULL REFERENCES branches(id),
  account_code_id       BIGINT       NOT NULL REFERENCES account_codes(id),

  -- 시트 원본 필드 (13개)
  status                VARCHAR(30)  NOT NULL DEFAULT 'completed',  -- 'completed' | 'partially_refunded' | 'fully_refunded'
  order_date            DATE         NOT NULL,                  -- 주문일자
  accounting_year       INTEGER      NOT NULL,                  -- 귀속연 (YYYY)
  accounting_month      INTEGER      NOT NULL,                  -- 귀속월 (1~12)
  receipt_confirmed     BOOLEAN      NOT NULL DEFAULT FALSE,    -- 수령확인
  created_by            BIGINT       NOT NULL REFERENCES users(id),  -- 작성자 (시트: 박영준 등)
  item_name             VARCHAR(200) NOT NULL,                  -- 항목 (품목명)
  unit_price            BIGINT       NOT NULL DEFAULT 0,        -- 단가 VAT+
  quantity              INTEGER      NOT NULL DEFAULT 1,        -- 수량
  shipping_fee          BIGINT       NOT NULL DEFAULT 0,        -- 배송비
  total_amount          BIGINT       NOT NULL,                  -- 총액 = unit_price × quantity + shipping_fee
  note                  TEXT         NULL,                      -- 비고
  receipt_url           TEXT         NULL,                      -- 링크 (구매 URL)

  -- 확장 필드
  receipt_confirmed_at  TIMESTAMPTZ  NULL,                      -- 수령확인한 시점
  is_long_delivery      BOOLEAN      NOT NULL DEFAULT FALSE,    -- 장기 배송 체크박스 (14일 기준 적용)

  -- "미정" 카테고리 관련
  is_pending            BOOLEAN      NOT NULL DEFAULT FALSE,    -- TRUE: category_code_id가 "미정" 카테고리
  pending_reason        TEXT         NULL,                      -- 미정 선택 사유
  reclassified_at       TIMESTAMPTZ  NULL,                      -- 재분류 시점
  reclassified_by       BIGINT       NULL REFERENCES users(id),
  original_account_code_id BIGINT    NULL REFERENCES account_codes(id),  -- 재분류 전 원래 카테고리

  -- 환불
  refunded_amount       BIGINT       NOT NULL DEFAULT 0,
  refund_reason         TEXT         NULL,
  refunded_at           TIMESTAMPTZ  NULL,
  refunded_by           BIGINT       NULL REFERENCES users(id),

  -- 이관
  is_migrated           BOOLEAN      NOT NULL DEFAULT FALSE,    -- 2026.1~4월 이관 데이터 플래그
  migrated_at           TIMESTAMPTZ  NULL,

  -- Soft delete
  deleted_at            TIMESTAMPTZ  NULL,
  deleted_by            BIGINT       NULL REFERENCES users(id),

  -- 공통
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_expenses_status CHECK (status IN ('completed', 'partially_refunded', 'fully_refunded')),
  CONSTRAINT chk_expenses_month CHECK (accounting_month BETWEEN 1 AND 12),
  CONSTRAINT chk_expenses_quantity CHECK (quantity > 0),
  CONSTRAINT chk_expenses_amounts CHECK (unit_price >= 0 AND shipping_fee >= 0 AND total_amount >= 0),
  CONSTRAINT chk_expenses_refunded CHECK (refunded_amount >= 0 AND refunded_amount <= total_amount),
  CONSTRAINT chk_expenses_refund_state CHECK (
    (status = 'completed' AND refunded_amount = 0) OR
    (status = 'partially_refunded' AND refunded_amount > 0 AND refunded_amount < total_amount) OR
    (status = 'fully_refunded' AND refunded_amount = total_amount)
  )
);

-- 조회 성능용 인덱스
CREATE INDEX idx_expenses_branch_accounting ON expenses (branch_id, accounting_year, accounting_month)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_category ON expenses (account_code_id, accounting_year, accounting_month)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_order_date ON expenses (order_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_created_by ON expenses (created_by);
CREATE INDEX idx_expenses_pending ON expenses (is_pending) WHERE is_pending = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_expenses_receipt_pending ON expenses (order_date)
  WHERE receipt_confirmed = FALSE AND deleted_at IS NULL;
```

**`total_amount` 자동 계산 트리거**

```sql
CREATE OR REPLACE FUNCTION calc_total_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_amount := NEW.unit_price * NEW.quantity + NEW.shipping_fee;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expenses_total_amount
  BEFORE INSERT OR UPDATE OF unit_price, quantity, shipping_fee
  ON expenses
  FOR EACH ROW EXECUTE FUNCTION calc_total_amount();
```

**시트 필드 매핑**

| 시트 필드 | DB 컬럼 |
|---|---|
| 구분 (결제완료/구매요청) | `status` (completed/fully_refunded 등으로 변환) |
| 주문일자 | `order_date` |
| 귀속연월 (2026-01 형식) | `accounting_year`, `accounting_month` 분리 |
| 수령확인 (TRUE/FALSE) | `receipt_confirmed` |
| 작성자 (박영준 등) | `created_by` (user_id로 매핑 필요) |
| 계정 | `account_code_id` FK |
| 항목 | `item_name` |
| 금액(VAT+) | `unit_price` |
| 수량 | `quantity` |
| 배송비 | `shipping_fee` |
| 총액 | `total_amount` (트리거로 자동 계산) |
| 비고 | `note` |
| 링크 | `receipt_url` |

### 5-2. `product_catalog`

지점별 품목 마스터. 자동 생성 (지출 등록 시 신규 품목 자동 추가).

```sql
CREATE TABLE product_catalog (
  id                    BIGSERIAL PRIMARY KEY,
  branch_id             BIGINT       NOT NULL REFERENCES branches(id),
  name                  VARCHAR(200) NOT NULL,
  default_unit_price    BIGINT       NOT NULL DEFAULT 0,
  default_account_code_id BIGINT     NULL REFERENCES account_codes(id),
  default_url           TEXT         NULL,
  default_note          TEXT         NULL,
  order_count           INTEGER      NOT NULL DEFAULT 0,
  last_ordered_at       TIMESTAMPTZ  NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (branch_id, name)
);

CREATE INDEX idx_product_catalog_branch ON product_catalog (branch_id);
CREATE INDEX idx_product_catalog_name_search ON product_catalog (branch_id, name text_pattern_ops);
```

**갱신 로직**
- 지출 등록 시 (branch_id, item_name) 매칭되는 레코드 없으면 INSERT
- 매칭되면 `default_unit_price`, `default_url`, `order_count`, `last_ordered_at` UPDATE
- 지출 수정 시 구 품목명 레코드는 유지, 새 품목명 레코드 갱신

---

## 6. 부가 도메인

### 6-1. `duplicate_warnings`

중복 등록 경고 로그. 같은 날 같은 품목 3회 이상 등록 시 사용자가 "그래도 등록" 선택한 이력.

```sql
CREATE TABLE duplicate_warnings (
  id                    BIGSERIAL PRIMARY KEY,
  expense_id            BIGINT       NOT NULL REFERENCES expenses(id),
  warning_count         INTEGER      NOT NULL,              -- 당일 N번째 등록인지
  user_confirmed_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_dw_expense ON duplicate_warnings (expense_id);
```

### 6-2. `notifications`

시스템 알림 기록. 미정 카테고리 등록 알림, 분기 초과 경고 등.

```sql
CREATE TABLE notifications (
  id                    BIGSERIAL PRIMARY KEY,
  recipient_user_id     BIGINT       NULL REFERENCES users(id),  -- 특정 유저 대상
  recipient_role        VARCHAR(30)  NULL,                   -- 역할 대상 (hq_gm 등)
  notification_type     VARCHAR(50)  NOT NULL,               -- 'pending_category_created', 'quarterly_over_budget', ...
  title                 VARCHAR(200) NOT NULL,
  body                  TEXT         NULL,
  target_type           VARCHAR(50)  NULL,                   -- 'expense' | 'budget_adjustment' | ...
  target_id             BIGINT       NULL,
  is_read               BOOLEAN      NOT NULL DEFAULT FALSE,
  read_at               TIMESTAMPTZ  NULL,
  slack_sent_at         TIMESTAMPTZ  NULL,                   -- 슬랙 발송 시점
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_user_id, is_read)
  WHERE is_read = FALSE;
CREATE INDEX idx_notifications_role ON notifications (recipient_role, is_read)
  WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications (notification_type);
```

**MVP 단계**: 테이블만 생성, 실제 알림 발송은 Phase 2.

### 6-3. `audit_logs`

**모든 변경 액션**에 대한 감사 로그. 지점 직원의 자기 지점 내 수정/삭제도 전부 기록.

```sql
CREATE TABLE audit_logs (
  id                    BIGSERIAL PRIMARY KEY,
  action_type           VARCHAR(50)  NOT NULL,               -- 'expense.create' | 'expense.update' | 'expense.delete' | 'budget.revise' | ...
  target_type           VARCHAR(50)  NOT NULL,               -- 'expense' | 'annual_budget' | 'budget_adjustment' | ...
  target_id             BIGINT       NOT NULL,
  actor_user_id         BIGINT       NOT NULL REFERENCES users(id),
  actor_role            VARCHAR(30)  NOT NULL,               -- 액션 시점의 role (스냅샷)
  branch_id             BIGINT       NULL REFERENCES branches(id),  -- 맥락 지점 (지출 관련이면 해당 지점)
  before_snapshot       JSONB        NULL,                   -- 변경 전 전체 레코드
  after_snapshot        JSONB        NULL,                   -- 변경 후 전체 레코드
  reason                TEXT         NULL,                   -- 삭제/수정 사유
  ip_address            VARCHAR(45)  NULL,
  user_agent            TEXT         NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);
CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_branch ON audit_logs (branch_id, created_at DESC);
CREATE INDEX idx_audit_type ON audit_logs (action_type, created_at DESC);
```

**추적 대상 액션 (MVP)**

| action_type | target_type |
|---|---|
| `expense.create` | expense |
| `expense.update` | expense |
| `expense.delete` | expense (soft) |
| `expense.refund` | expense |
| `expense.receipt_confirm` | expense |
| `expense.reclassify` | expense (미정→정식) |
| `budget.revise` | annual_budget |
| `budget.adjustment.create` | budget_adjustment |
| `budget.transfer.request` | budget_adjustment |
| `budget.transfer.approve` | budget_adjustment |

**스냅샷 저장 방식**
- `before_snapshot`, `after_snapshot`: 해당 레코드 전체를 JSONB로 직렬화
- diff는 조회 시 계산 (라이브러리: `deepdiff` 등)
- 대용량 JSONB는 GIN 인덱스 고려 (MVP에선 불필요)

---

## 7. ERD 요약

```
branches ───────┬─── user_branch_memberships ──── users
                │                                    │
                │                                    ├── (created_by)
                │                                    ├── (reclassified_by)
                │                                    ├── (refunded_by)
                │                                    ├── (deleted_by)
                │                                    └── (actor_user_id) ─ audit_logs
                │
                ├─── annual_budgets ─── budget_revision_history
                │         │
                │         └─── (monthly lookup)
                │
                ├─── budget_adjustments
                │         │
                │         ├── (transfer_pair_id → self)
                │         ├── (source_account_code_id → account_codes)
                │         ├── (target_account_code_id → account_codes)
                │         └── (original_expense_id → expenses)
                │
                ├─── expenses ─┬── (account_code_id → account_codes)
                │              ├── duplicate_warnings
                │              └── (original_account_code_id)
                │
                └─── product_catalog ─── (default_account_code_id)

account_categories ─── account_codes (대→소 1:N)
notifications (참조 관계 느슨, 알림 기록용)
audit_logs (모든 변경의 감사 로그)
```

---

## 8. 마이그레이션 / 시드 데이터

### 8-1. 시드 순서

1. `branches` (12개)
2. `users` (최소 1개 GM 계정 + 각 지점별 1개 staff 계정)
3. `user_branch_memberships` (staff 계정들)
4. `account_categories` (7개)
5. `account_codes` (10개 + pending 1개)
6. `annual_budgets` — 2026년 예산 (지점별 시트에서 CSV 업로드)
7. `expenses` — 2026.1~4월 이관 데이터 (지점별 시트에서 파싱)

### 8-2. 이관 스크립트 요구사항

**예산 이관**
- 입력: 지점별 시트의 "1. 경영계획 예산(VAT+)" 블록
- 출력: `annual_budgets` 1,440 레코드

**지출 이관**
- 입력: 지점별 시트의 지출관리 탭 전체 행
- 출력: `expenses` 약 2,500~3,000 레코드
- 특수 처리:
  - 카테고리 미입력 → `is_pending = TRUE`, `category_code_id = pending_uncategorized`
  - `is_migrated = TRUE`, `migrated_at = <이관 시각>`
  - 수령확인 누락 건은 원본 TRUE/FALSE 그대로
  - 작성자명 → `users.name`과 매칭해서 user_id 연결 (못 찾으면 시스템 계정)

**검증**
- 이관 후 집계 쿼리로 시트 대시보드의 월별 합계와 일치하는지 대조
- 불일치 시 건별 추적 가능하도록 로깅

---

## 9. 성능 고려사항

### 9-1. 대시보드 집계 쿼리

가장 많이 호출될 쿼리: "지점 × 월별 × 카테고리 × 소진율". 다음 인덱스로 커버:
- `idx_expenses_branch_accounting` (branch_id, accounting_year, accounting_month)

12개 지점 × 10개 카테고리 × 12월 = 1,440 셀을 1초 내 집계 가능해야 함.

### 9-2. 소프트 삭제 필터링

모든 `expenses` 조회 쿼리는 `deleted_at IS NULL` 필터를 반드시 포함. ORM 레이어에서 기본 스코프로 설정 권장 (SQLAlchemy `--listens_for` 이벤트 훅 or Django soft-delete mixin).

### 9-3. 감사 로그 용량

- MVP: 월 5,000~10,000 건 예상 (지출 등록 2,000 + 수정 1,000 + 기타 2,000~3,000 + 본사 액션 수백)
- 연 12만 건, 5년 60만 건. 인덱스 정상 작동하면 문제 없음.
- Phase 3 이후 아카이빙 전략 필요시 검토.

---

## 10. 다음 단계

- `business-rules.md`: 이 모델 위에 작동하는 룰 명세
- `api-spec.md`: 이 모델 기반 REST API
- `migration/001_initial_schema.sql`: 이 문서 기반 초기 마이그레이션
- `migration/002_seed_data.sql`: 시드 데이터

---

## 11. 변경 이력

| 일자 | 변경 | 작성자 |
|---|---|---|
| 2026-04-20 | 초안 작성 (엣지 케이스 11개 + B영역 5개 결정 반영) | PM |
