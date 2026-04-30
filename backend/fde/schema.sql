-- FDE DB 초기 스키마
-- 실행: psql -U fde -d fde -f schema.sql

CREATE TABLE IF NOT EXISTS page_visits (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    user_name VARCHAR(50),
    page_path VARCHAR(255) NOT NULL,
    visited_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_scores (
    id SERIAL PRIMARY KEY,
    member_name VARCHAR(50) NOT NULL UNIQUE,
    github_username VARCHAR(50),
    problem_score DECIMAL(5,1) DEFAULT 0,
    score_reason TEXT DEFAULT '',
    github_stats JSONB DEFAULT '{}',
    visit_count INT DEFAULT 0,
    evaluated_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS score_history (
    id SERIAL PRIMARY KEY,
    member_name VARCHAR(50) NOT NULL,
    problem_score DECIMAL(5,1),
    score_reason TEXT,
    evaluated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(50),
    action_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_page_path ON page_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_score_history_member ON score_history(member_name);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at);

CREATE TABLE IF NOT EXISTS parkmingyu_contracts (
    id             SERIAL PRIMARY KEY,
    doc_number     VARCHAR(100),
    doc_title      VARCHAR(500),
    signer_name    VARCHAR(100) NOT NULL,
    signer_contact VARCHAR(50),
    signer_email   VARCHAR(200),
    request_date   DATE,
    sign_date      DATE,
    expiry_date    DATE,
    status         VARCHAR(50),
    uploaded_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_contracts_status ON parkmingyu_contracts(status);

-- 김소연: 멤버십 이상케이스 감지
CREATE TABLE IF NOT EXISTS soyeon_anomalies (
    id SERIAL PRIMARY KEY,
    anomaly_key VARCHAR(100) NOT NULL UNIQUE,
    anomaly_type VARCHAR(30) NOT NULL,
    user_id INT NOT NULL,
    phone_number VARCHAR(50),
    place VARCHAR(100),
    user_name VARCHAR(100),
    teamfit_mbs_id INT NOT NULL,
    teamfit_mbs_name VARCHAR(200),
    teamfit_begin DATE,
    teamfit_end DATE,
    overlap_mbs_id INT,
    overlap_begin DATE,
    overlap_end DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    first_reminded_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ
);
-- 컬럼 추가 마이그레이션 (이미 테이블이 있는 경우)
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS user_name VARCHAR(100);
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS teamfit_mbs_name VARCHAR(200);
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS fitness_mbs_id INT;
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS fitness_mbs_name VARCHAR(200);
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS fitness_begin DATE;
ALTER TABLE soyeon_anomalies ADD COLUMN IF NOT EXISTS fitness_end DATE;

CREATE INDEX IF NOT EXISTS idx_soyeon_anomalies_status ON soyeon_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_soyeon_anomalies_place  ON soyeon_anomalies(place);

INSERT INTO member_scores (member_name, github_username) VALUES
    ('김동하', NULL),
    ('김소연', NULL),
    ('김영신', NULL),
    ('박민규', NULL),
    ('이예원', NULL),
    ('정석환', NULL),
    ('최지희', NULL),
    ('최치환', NULL)
ON CONFLICT (member_name) DO NOTHING;

-- ============================================================
-- 김동하: 실적분석 스냅샷 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS dongha_sales_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,
    branch VARCHAR(30) NOT NULL,
    ft_mbs BIGINT DEFAULT 0,
    ft_option BIGINT DEFAULT 0,
    ft_daily BIGINT DEFAULT 0,
    ft_refund BIGINT DEFAULT 0,
    pt_mbs BIGINT DEFAULT 0,
    pt_refund BIGINT DEFAULT 0,
    pt_ansim BIGINT DEFAULT 0,
    ft_target BIGINT DEFAULT 0,
    pt_target BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, branch)
);

CREATE TABLE IF NOT EXISTS dongha_ft_new_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,
    branch VARCHAR(30) NOT NULL,
    bs1_count INT DEFAULT 0,
    bs1_revenue BIGINT DEFAULT 0,
    prev_month_same_period INT DEFAULT 0,
    prev_year_same_period INT DEFAULT 0,
    prev_month_full INT DEFAULT 0,
    prev_year_full INT DEFAULT 0,
    target_count INT DEFAULT 0,
    target_revenue BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, branch)
);

CREATE TABLE IF NOT EXISTS dongha_pt_trial_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,
    branch VARCHAR(30) NOT NULL,
    trial_count INT DEFAULT 0,
    trial_revenue BIGINT DEFAULT 0,
    solo_count INT DEFAULT 0,
    combo_count INT DEFAULT 0,
    conversion_target INT DEFAULT 0,
    conversion_count INT DEFAULT 0,
    conversion_revenue BIGINT DEFAULT 0,
    target_trial INT DEFAULT 0,
    target_conversion INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, branch)
);

CREATE TABLE IF NOT EXISTS dongha_rereg_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,
    branch VARCHAR(30) NOT NULL,
    category VARCHAR(10) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    target_count INT DEFAULT 0,
    pre_paid_count INT DEFAULT 0,
    paid_count INT DEFAULT 0,
    rereg_rate DECIMAL(5,1) DEFAULT 0,
    target_rate DECIMAL(5,1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, branch, category, period_type)
);

CREATE TABLE IF NOT EXISTS dongha_subscription_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,
    branch VARCHAR(30) NOT NULL,
    total_count INT DEFAULT 0,
    maintain_count INT DEFAULT 0,
    return_count INT DEFAULT 0,
    term_convert_count INT DEFAULT 0,
    churn_count INT DEFAULT 0,
    pending_cancel_count INT DEFAULT 0,
    undecided_count INT DEFAULT 0,
    churn_rate DECIMAL(5,1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, branch)
);

CREATE INDEX IF NOT EXISTS idx_dongha_sales_date ON dongha_sales_snapshot(snapshot_date, target_month);
CREATE INDEX IF NOT EXISTS idx_dongha_ft_new_date ON dongha_ft_new_snapshot(snapshot_date, target_month);
CREATE INDEX IF NOT EXISTS idx_dongha_pt_trial_date ON dongha_pt_trial_snapshot(snapshot_date, target_month);
CREATE INDEX IF NOT EXISTS idx_dongha_rereg_date ON dongha_rereg_snapshot(snapshot_date, target_month);
CREATE INDEX IF NOT EXISTS idx_dongha_sub_date ON dongha_subscription_snapshot(snapshot_date, target_month);

-- ============================================================
-- 김동하: 트레이너 관리 대시보드
-- ============================================================

-- 트레이너별 월별 지표 스냅샷 (트레이너 × 월 × 지점 단위)
CREATE TABLE IF NOT EXISTS dongha_trainer_monthly (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    target_month VARCHAR(7) NOT NULL,          -- YYYY-MM
    trainer_user_id INT NOT NULL,
    trainer_name VARCHAR(100),
    branch VARCHAR(30),
    active_members INT DEFAULT 0,              -- 지표1: 유효회원 수
    sessions_done INT DEFAULT 0,               -- 지표2: 월 세션 수
    trial_end_count INT DEFAULT 0,             -- 지표3 분모: 체험 종료자
    trial_convert_count INT DEFAULT 0,         -- 지표3 분자: 체험전환자
    regular_end_count INT DEFAULT 0,           -- 지표4 분모: 정규 만료자
    regular_rereg_count INT DEFAULT 0,         -- 지표4 분자: 재등록자
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, target_month, trainer_user_id, branch)
);

CREATE INDEX IF NOT EXISTS idx_dongha_trainer_month
    ON dongha_trainer_monthly(target_month, trainer_user_id);
CREATE INDEX IF NOT EXISTS idx_dongha_trainer_snap
    ON dongha_trainer_monthly(snapshot_date);

-- 기준값 (싱글턴, id=1만 사용)
CREATE TABLE IF NOT EXISTS dongha_trainer_criteria (
    id SERIAL PRIMARY KEY,
    active_members_min INT DEFAULT 15,
    sessions_min INT DEFAULT 120,
    conversion_min DECIMAL(5,1) DEFAULT 30.0,
    rereg_min DECIMAL(5,1) DEFAULT 40.0,
    fail_threshold INT DEFAULT 3,              -- 재계약 고려: 미달 지표 수 ≥ 이 값
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by VARCHAR(100)
);
INSERT INTO dongha_trainer_criteria (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 신규 지표(세션 완료율/평균 소진일) 기준값 — 컬럼 추가 (idempotent)
ALTER TABLE dongha_trainer_criteria
    ADD COLUMN IF NOT EXISTS completion_min  DECIMAL(5,1) DEFAULT 70.0,
    ADD COLUMN IF NOT EXISTS days_per_8_max  DECIMAL(5,1) DEFAULT 30.0,
    ADD COLUMN IF NOT EXISTS ref_days_per_8  INT DEFAULT 30;

-- 체험 유효회원 별도 저장 (토글용)
ALTER TABLE dongha_trainer_monthly
    ADD COLUMN IF NOT EXISTS active_members_trial INT DEFAULT 0;

-- 평가 점수 배점 (100점 만점, SV가 UI에서 조정 가능)
ALTER TABLE dongha_trainer_criteria
    ADD COLUMN IF NOT EXISTS weight_active      INT DEFAULT 20,   -- 유효회원
    ADD COLUMN IF NOT EXISTS weight_sessions    INT DEFAULT 20,   -- 월 세션
    ADD COLUMN IF NOT EXISTS weight_conversion  INT DEFAULT 15,   -- 체험전환율
    ADD COLUMN IF NOT EXISTS weight_rereg       INT DEFAULT 30,   -- 재등록률
    ADD COLUMN IF NOT EXISTS weight_days_per_8  INT DEFAULT 15;   -- 소진일(8회)

-- 완료된 PT 멤버십 per-row 스냅샷 (시작월 기준 cohort 집계용)
CREATE TABLE IF NOT EXISTS dongha_trainer_completion (
    snapshot_date      DATE NOT NULL,
    target_month       VARCHAR(7) NOT NULL,   -- 멤버십 시작월 (cohort)
    trainer_user_id    INT NOT NULL,
    trainer_name       VARCHAR(100),
    branch             VARCHAR(30),
    contact            VARCHAR(50),
    begin_date         DATE NOT NULL,
    end_date           DATE,                  -- 계약 종료일
    last_session_date  DATE NOT NULL,         -- N번째 출석 세션 수업날짜
    total_sessions     INT NOT NULL,          -- N
    days_used          INT NOT NULL,          -- last_session_date - begin_date
    membership_name    VARCHAR(200),
    created_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE (snapshot_date, trainer_user_id, contact, begin_date)
);
CREATE INDEX IF NOT EXISTS idx_dongha_comp_month
    ON dongha_trainer_completion(target_month, trainer_user_id);
CREATE INDEX IF NOT EXISTS idx_dongha_comp_snap
    ON dongha_trainer_completion(snapshot_date);

-- 회원이름 컬럼 추가 (모달에서 번호 대신 이름 표시)
ALTER TABLE dongha_trainer_completion
    ADD COLUMN IF NOT EXISTS member_name VARCHAR(100);

-- 스냅샷 잡 실행 상태 (silent failure 방지). 잡명별 1행 (UPSERT).
CREATE TABLE IF NOT EXISTS dongha_snapshot_status (
    job_name        VARCHAR(50) PRIMARY KEY,
    last_started    TIMESTAMP,
    last_finished   TIMESTAMP,
    success         BOOLEAN,
    rows_written    INT,
    error_stage     VARCHAR(50),
    error_message   TEXT,
    error_traceback TEXT,
    duration_sec    NUMERIC(10, 2)
);

-- 직원 등 평가 대상 제외 트레이너 명단 (trainer_name 기준)
CREATE TABLE IF NOT EXISTS dongha_trainer_excluded (
    trainer_name VARCHAR(100) PRIMARY KEY,
    reason       TEXT,
    excluded_by  VARCHAR(100),
    created_at   TIMESTAMP DEFAULT NOW()
);

-- 초기 직원 명단 시드 — 테이블이 완전히 비어있을 때만 주입
-- (사용자가 수동 삭제한 이름을 부활시키지 않도록)
INSERT INTO dongha_trainer_excluded (trainer_name, reason, excluded_by)
SELECT *
FROM (VALUES
    ('강기랑', '직원', 'system'),
    ('김도혁', '직원', 'system'),
    ('양동원', '직원', 'system'),
    ('김송희', '직원', 'system'),
    ('이예슬', '직원', 'system'),
    ('변진규', '직원', 'system')
) AS seed(trainer_name, reason, excluded_by)
WHERE NOT EXISTS (SELECT 1 FROM dongha_trainer_excluded);

-- ============================================================
-- 도길록: 인스타 해시태그 수집기
-- ============================================================

CREATE TABLE IF NOT EXISTS dogilrok_insta_hashtags (
    id SERIAL PRIMARY KEY,
    tag TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dogilrok_insta_posts (
    id SERIAL PRIMARY KEY,
    post_pk TEXT UNIQUE NOT NULL,
    shortcode TEXT NOT NULL,
    post_url TEXT NOT NULL,
    author_username TEXT,
    author_full_name TEXT,
    author_profile_pic_url TEXT,
    caption TEXT,
    media_type TEXT,
    thumbnail_url TEXT,
    like_count INT,
    comment_count INT,
    posted_at TIMESTAMPTZ,
    matched_tags TEXT[] NOT NULL DEFAULT '{}',
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dogilrok_insta_posts_posted_at
    ON dogilrok_insta_posts (posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_dogilrok_insta_posts_matched_tags
    ON dogilrok_insta_posts USING GIN (matched_tags);

INSERT INTO dogilrok_insta_hashtags (tag) VALUES ('팀버핏'), ('TEAMBUTFIT')
ON CONFLICT (tag) DO NOTHING;

-- 80점 경영 진단
CREATE TABLE IF NOT EXISTS branch_diagnosis (
    id           SERIAL PRIMARY KEY,
    branch_name  TEXT NOT NULL,
    diagnosed_at DATE NOT NULL DEFAULT CURRENT_DATE,
    achieved     BOOLEAN DEFAULT FALSE,
    created_by   TEXT,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnosis_items (
    id            SERIAL PRIMARY KEY,
    diagnosis_id  INTEGER NOT NULL REFERENCES branch_diagnosis(id) ON DELETE CASCADE,
    category      TEXT NOT NULL,
    sub_category  TEXT NOT NULL,
    item_text     TEXT NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    checked       BOOLEAN DEFAULT FALSE,
    link          TEXT DEFAULT '',
    note          TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_branch_diagnosis_branch ON branch_diagnosis(branch_name);
CREATE INDEX IF NOT EXISTS idx_diagnosis_items_diag ON diagnosis_items(diagnosis_id);

-- ============================================================================
-- 이예원 — 버핏그라운드 예산관리 (Phase 0 스캐폴드)
-- 전체 스펙: frontend/packages/erp/src/pages/LeeYewon/budget/docs/
-- 모든 테이블은 yewon_ 프리픽스 (FDE 공용 DB 충돌 방지)
-- ============================================================================

-- ── 조직 ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yewon_branches (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(30)  NOT NULL UNIQUE,
    name          VARCHAR(50)  NOT NULL,
    display_order INTEGER      NOT NULL DEFAULT 0,
    opened_at     DATE,
    is_active     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yewon_budget_users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(50)  NOT NULL UNIQUE,
    butfit_user_id INTEGER,                         -- FDE 로그인 연동용 (nullable, 이관 작성자는 NULL)
    role           VARCHAR(30)  NOT NULL DEFAULT 'branch_staff',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_yewon_users_role CHECK (role IN (
        'branch_staff', 'hq_pm', 'hq_sgm', 'hq_gm', 'hq_planning_lead'
    ))
);

CREATE TABLE IF NOT EXISTS yewon_user_branch_memberships (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES yewon_budget_users(id) ON DELETE CASCADE,
    branch_id  INTEGER NOT NULL REFERENCES yewon_branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, branch_id)
);

-- ── 카테고리 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yewon_account_categories (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(40)  NOT NULL UNIQUE,
    name          VARCHAR(50)  NOT NULL,
    display_order INTEGER      NOT NULL DEFAULT 0,
    is_pending    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_fixed_cost BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yewon_account_codes (
    id            SERIAL PRIMARY KEY,
    category_id   INTEGER      NOT NULL REFERENCES yewon_account_categories(id),
    code          VARCHAR(60)  NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,           -- CSV 실제 한글명 그대로 (예: "샤워실/탈의실(고객용 소모품)")
    display_order INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 예산 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yewon_annual_budgets (
    id              SERIAL PRIMARY KEY,
    branch_id       INTEGER     NOT NULL REFERENCES yewon_branches(id),
    account_code_id INTEGER     NOT NULL REFERENCES yewon_account_codes(id),
    year            INTEGER     NOT NULL,
    month           INTEGER     NOT NULL,
    amount          BIGINT      NOT NULL DEFAULT 0,  -- 원 단위, VAT+
    is_locked       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by      INTEGER     REFERENCES yewon_budget_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, account_code_id, year, month),
    CONSTRAINT chk_yewon_annual_budgets_month  CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT chk_yewon_annual_budgets_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS yewon_budget_revision_history (
    id               SERIAL PRIMARY KEY,
    annual_budget_id INTEGER     NOT NULL REFERENCES yewon_annual_budgets(id),
    old_amount       BIGINT      NOT NULL,
    new_amount       BIGINT      NOT NULL,
    reason           TEXT        NOT NULL,
    revised_by       INTEGER     NOT NULL REFERENCES yewon_budget_users(id),
    revised_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yewon_budget_adjustments (
    id                      SERIAL PRIMARY KEY,
    branch_id               INTEGER      NOT NULL REFERENCES yewon_branches(id),
    account_code_id         INTEGER      NOT NULL REFERENCES yewon_account_codes(id),
    year                    INTEGER      NOT NULL,
    quarter                 INTEGER,
    month                   INTEGER,
    adjustment_type         VARCHAR(30)  NOT NULL,
    adjustment_amount       BIGINT       NOT NULL,
    reason                  TEXT         NOT NULL,
    flex_approval_ref       VARCHAR(100),
    transfer_pair_id        INTEGER      REFERENCES yewon_budget_adjustments(id),
    source_account_code_id  INTEGER      REFERENCES yewon_account_codes(id),
    target_account_code_id  INTEGER      REFERENCES yewon_account_codes(id),
    created_by              INTEGER      NOT NULL REFERENCES yewon_budget_users(id),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_yewon_ba_type     CHECK (adjustment_type IN ('supplementary', 'transfer_out', 'transfer_in')),
    CONSTRAINT chk_yewon_ba_quarter  CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4),
    CONSTRAINT chk_yewon_ba_month    CHECK (month IS NULL OR month BETWEEN 1 AND 12),
    CONSTRAINT chk_yewon_ba_pair     CHECK (
        adjustment_type = 'supplementary'
        OR (adjustment_type IN ('transfer_out','transfer_in') AND transfer_pair_id IS NOT NULL)
    )
);

-- ── 지출 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yewon_expenses (
    id                       SERIAL PRIMARY KEY,
    branch_id                INTEGER      NOT NULL REFERENCES yewon_branches(id),
    account_code_id          INTEGER      NOT NULL REFERENCES yewon_account_codes(id),
    status                   VARCHAR(30)  NOT NULL DEFAULT 'completed',
    order_date               DATE         NOT NULL,
    accounting_year          INTEGER      NOT NULL,
    accounting_month         INTEGER      NOT NULL,
    receipt_confirmed        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by               INTEGER      NOT NULL REFERENCES yewon_budget_users(id),
    item_name                VARCHAR(200) NOT NULL,
    unit_price               BIGINT       NOT NULL DEFAULT 0,
    quantity                 INTEGER      NOT NULL DEFAULT 1,
    shipping_fee             BIGINT       NOT NULL DEFAULT 0,
    total_amount             BIGINT       NOT NULL,
    note                     TEXT,
    receipt_url              TEXT,
    receipt_confirmed_at     TIMESTAMPTZ,
    is_long_delivery         BOOLEAN      NOT NULL DEFAULT FALSE,
    is_pending               BOOLEAN      NOT NULL DEFAULT FALSE,
    pending_reason           TEXT,
    reclassified_at          TIMESTAMPTZ,
    reclassified_by          INTEGER      REFERENCES yewon_budget_users(id),
    original_account_code_id INTEGER      REFERENCES yewon_account_codes(id),
    refunded_amount          BIGINT       NOT NULL DEFAULT 0,
    refund_reason            TEXT,
    refunded_at              TIMESTAMPTZ,
    refunded_by              INTEGER      REFERENCES yewon_budget_users(id),
    is_migrated              BOOLEAN      NOT NULL DEFAULT FALSE,
    migrated_at              TIMESTAMPTZ,
    deleted_at               TIMESTAMPTZ,
    deleted_by               INTEGER      REFERENCES yewon_budget_users(id),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_yewon_expenses_status   CHECK (status IN ('completed','partially_refunded','fully_refunded')),
    CONSTRAINT chk_yewon_expenses_month    CHECK (accounting_month BETWEEN 1 AND 12),
    CONSTRAINT chk_yewon_expenses_quantity CHECK (quantity > 0),
    CONSTRAINT chk_yewon_expenses_amounts  CHECK (unit_price >= 0 AND shipping_fee >= 0 AND total_amount >= 0),
    CONSTRAINT chk_yewon_expenses_refunded CHECK (refunded_amount >= 0 AND refunded_amount <= total_amount),
    CONSTRAINT chk_yewon_expenses_refund_state CHECK (
        (status = 'completed' AND refunded_amount = 0)
        OR (status = 'partially_refunded' AND refunded_amount > 0 AND refunded_amount < total_amount)
        OR (status = 'fully_refunded' AND refunded_amount = total_amount)
    )
);

CREATE INDEX IF NOT EXISTS idx_yewon_expenses_branch_month
    ON yewon_expenses (branch_id, accounting_year, accounting_month)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_yewon_expenses_account_month
    ON yewon_expenses (account_code_id, accounting_year, accounting_month)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_yewon_expenses_pending
    ON yewon_expenses (is_pending)
    WHERE is_pending = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS yewon_product_catalog (
    id                      SERIAL PRIMARY KEY,
    branch_id               INTEGER      NOT NULL REFERENCES yewon_branches(id),
    name                    VARCHAR(200) NOT NULL,
    default_unit_price      BIGINT       NOT NULL DEFAULT 0,
    default_account_code_id INTEGER      REFERENCES yewon_account_codes(id),
    default_url             TEXT,
    default_note            TEXT,
    order_count             INTEGER      NOT NULL DEFAULT 0,
    last_ordered_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, name)
);

-- ── 부가 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yewon_duplicate_warnings (
    id                SERIAL PRIMARY KEY,
    expense_id        INTEGER     NOT NULL REFERENCES yewon_expenses(id),
    warning_count     INTEGER     NOT NULL,
    user_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yewon_notifications (
    id                SERIAL PRIMARY KEY,
    recipient_user_id INTEGER      REFERENCES yewon_budget_users(id),
    recipient_role    VARCHAR(30),
    notification_type VARCHAR(50)  NOT NULL,
    title             VARCHAR(200) NOT NULL,
    body              TEXT,
    target_type       VARCHAR(50),
    target_id         INTEGER,
    is_read           BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at           TIMESTAMPTZ,
    slack_sent_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yewon_audit_logs (
    id              SERIAL PRIMARY KEY,
    action_type     VARCHAR(50)  NOT NULL,
    target_type     VARCHAR(50)  NOT NULL,
    target_id       INTEGER      NOT NULL,
    actor_user_id   INTEGER      NOT NULL REFERENCES yewon_budget_users(id),
    actor_role      VARCHAR(30)  NOT NULL,
    branch_id       INTEGER      REFERENCES yewon_branches(id),
    before_snapshot JSONB,
    after_snapshot  JSONB,
    reason          TEXT,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yewon_audit_target ON yewon_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_yewon_audit_actor  ON yewon_audit_logs (actor_user_id, created_at DESC);

-- ── 시드: 14개 지점 (오픈일 순, 신도림만 is_active=TRUE) ──────────────────────
-- ON CONFLICT (code) DO NOTHING: 재실행 안전. 이미 있으면 스킵.
INSERT INTO yewon_branches (code, name, display_order, is_active) VALUES
    ('yeoksam_arc',    '역삼ARC',       1,  FALSE),
    ('dogok',          '도곡',          2,  FALSE),
    ('sindorim',       '신도림',        3,  TRUE),
    ('nonhyeon',       '논현',          4,  FALSE),
    ('pangyo',         '판교',          5,  FALSE),
    ('gangbyeon',      '강변',          6,  FALSE),
    ('gasan',          '가산',          7,  FALSE),
    ('samsung',        '삼성',          8,  FALSE),
    ('gwanghwamun',    '광화문',        9,  FALSE),
    ('hanti',          '한티',          10, FALSE),
    ('magok',          '마곡',          11, FALSE),
    ('pangyo_venture', '판교벤처타운',   12, FALSE),
    ('yeoksam_gfc',    '역삼GFC',       13, FALSE),
    ('hapjeong',       '합정',          14, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ── 시드: 대카테고리 7개 ───────────────────────────────────────────────────
INSERT INTO yewon_account_categories (code, name, display_order, is_pending, is_fixed_cost) VALUES
    ('operating_supplies',     '경상 소모품',    1, FALSE, FALSE),
    ('non_operating_supplies', '비경상 소모품',  2, FALSE, FALSE),
    ('other_expenses',         '기타 비용',      3, FALSE, FALSE),
    ('laundry',                '세탁',           4, FALSE, TRUE),
    ('cleaning_service',       '미화',           5, FALSE, TRUE),
    ('part_time_labor',        '파트 인건비',    6, FALSE, TRUE),
    ('pending',                '미정',           7, TRUE,  FALSE)
ON CONFLICT (code) DO NOTHING;

-- ── 시드: 소카테고리 (CSV 실제 이름 기준) ──────────────────────────────────
INSERT INTO yewon_account_codes (category_id, code, name, display_order) VALUES
    ((SELECT id FROM yewon_account_categories WHERE code='operating_supplies'),     'desk_backoffice',       '데스크/백오피스',              1),
    ((SELECT id FROM yewon_account_categories WHERE code='operating_supplies'),     'shower_locker',         '샤워실/탈의실(고객용 소모품)', 2),
    ((SELECT id FROM yewon_account_categories WHERE code='operating_supplies'),     'cleaning_supplies',     '청소/미화 소모품',             3),
    ((SELECT id FROM yewon_account_categories WHERE code='operating_supplies'),     'bg_tools',              '(BG) 소도구/기구소모품/가구',  4),
    ((SELECT id FROM yewon_account_categories WHERE code='non_operating_supplies'), 'towels_uniforms',       '수건/운동복',                  5),
    ((SELECT id FROM yewon_account_categories WHERE code='other_expenses'),         'member_rewards',        '회원 리워드',                  6),
    ((SELECT id FROM yewon_account_categories WHERE code='other_expenses'),         'transport',             '운반비',                       7),
    ((SELECT id FROM yewon_account_categories WHERE code='laundry'),                'laundry_service',       '세탁',                         8),
    ((SELECT id FROM yewon_account_categories WHERE code='cleaning_service'),       'cleaning_operation',    '미화',                         9),
    ((SELECT id FROM yewon_account_categories WHERE code='part_time_labor'),        'base_salary',           '기본급',                       10),
    ((SELECT id FROM yewon_account_categories WHERE code='pending'),                'pending_uncategorized', '미정',                         99)
ON CONFLICT (code) DO NOTHING;

-- ── 최지희: 고위드 지출내역 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jihee_gowith_expenses (
    expense_id        BIGINT PRIMARY KEY,
    year_month        VARCHAR(6)   NOT NULL,
    expense_date      VARCHAR(8),
    expense_time      VARCHAR(6),
    krw_amount        BIGINT,
    currency          VARCHAR(10),
    approved_amount   BIGINT,
    approval_status   VARCHAR(50),
    purpose_name      VARCHAR(200),
    card_alias        VARCHAR(200),
    card_user_name    VARCHAR(100),
    short_card_number VARCHAR(50),
    store_name        VARCHAR(300),
    store_address     TEXT,
    memo              TEXT,
    journal_date      DATE,
    synced_at         TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jihee_gowith_ym ON jihee_gowith_expenses (year_month);
