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
