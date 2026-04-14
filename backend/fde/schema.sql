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
    ('최지희', NULL),
    ('최치환', NULL)
ON CONFLICT (member_name) DO NOTHING;
