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

INSERT INTO member_scores (member_name, github_username) VALUES
    ('김동하', NULL),
    ('김소연', NULL),
    ('김영신', NULL),
    ('박민규', NULL),
    ('이예원', NULL),
    ('최재은', NULL),
    ('최지희', NULL),
    ('최치환', NULL)
ON CONFLICT (member_name) DO NOTHING;

-- ============================================================
-- 김동하: 실적분석 스냅샷 테이블
-- ============================================================

-- 섹션1: 지점별 FT/PT 매출
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

-- 섹션2: FT 신규 BS 1회차
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

-- 섹션3: PT 체험권/전환율
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

-- 섹션4: 재등록률 (FT기간권, PT정규)
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

-- 섹션5: 구독이탈
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
