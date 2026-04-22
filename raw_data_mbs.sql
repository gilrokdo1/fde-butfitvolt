/* 2025-11-21 */
/* 2025-12-19: is_benefit 기반 필터로 변경 (0원 법인 멤버십 포함) */
/* 2025-01-27: 세션 정보 추가 (ses_datetime, ses_count, pay_created) - data_source3.0 지원 */
/* 2025-01-28: 체험정규 로직에 1일/2일/3일/일일 조건 추가 */
/* 2025-01-29: 결제상태 컬럼 추가 (정상/환불/부분결제/양도) - b_payment_btransactionpaylog 활용 */
/* 2025-01-31: 체험정규 로직 통일 (크레딧<400=체험 전체 적용), 4개 회차 컬럼 추가 */
/* 2025-02-03: 체험정규 로직 하영쌤 V3 통일 (임직원→NULL, PT 10/20/30/40회→정규) */
/* 2025-02-03: 피트니스 체험정규 = 정규 아니면 NULL (1일권/체험/크레딧<400 → NULL) */
/* 2025-02-10: 환불 데이터 개선 - 부분/전체환불 구분, 환불금액/유효결제금액 추가, 가격은 항상 원본 양수값 */
/* 2026-03-13: 이용상태 컬럼 추가 - 구독(이용 중/지난 구독/해지 예약/해지 완료) + 기간권(이용 중/휴회/만료/휴면/환불) */
/* 2026-03-31: 체험정규/회차 카운팅 조건 변경 - 0원 제외, 카테고리NULL/대관 제외, 버핏레이스/다이나핏챌린지 제외, 임직원 제외 삭제 */
/* 2026-04-06: 정합성 개선 - 피트니스체험→체험, 홀리데이/법인제휴→NULL, 동시구매 양방향태깅+체험우선정렬, 신재휴체 휴면(체험→정규2개월+) 추가 */
/* 2026-04-09: 카테고리_depth2 컬럼 추가, 신재휴체 태깅 수정 - lt_정규=1이면 신규 (체험→정규 전환 시 갭 무관) */

WITH RECURSIVE
category AS (
    SELECT a.id AS id, a.name AS name
    FROM b_payment_bmaincategory a
    WHERE a.depth = 1
    UNION ALL
    SELECT a.id AS id,
        CASE
            WHEN c.name = '임직원/패밀리' THEN a.name
            ELSE c.name
        END
    FROM b_payment_bmaincategory a
    JOIN category c ON a.parent_id = c.id
    WHERE a.depth IN (2, 3)
),

-- 부분결제 거래 식별 (마지막 paylog 기준: 분할결제 완납 건은 제외)
unpaid_transactions AS (
    SELECT transaction_id
    FROM (
        SELECT DISTINCT ON (transaction_id) transaction_id, is_unpaid, transaction_type
        FROM b_payment_btransactionpaylog
        ORDER BY transaction_id, id DESC
    ) latest_paylog
    WHERE is_unpaid = true OR transaction_type = 'UNPAID'
),

-- 세션 카운트 (멤버십별 체크인 횟수)
ses_count AS (
    SELECT b_membership_pk AS mbs_id, COUNT(id) AS ses_count
    FROM b_class_bsessionreservation
    WHERE is_check_in IS TRUE
    GROUP BY b_membership_pk
),

-- 첫 세션 datetime (멤버십별 첫 체크인 세션)
ses_first AS (
    SELECT DISTINCT ON (a.b_membership_pk)
        a.b_membership_pk AS mbs_id,
        b.date AS ses_date,
        b.start_time AS ses_start_time,
        (b.date || ' ' || b.start_time)::TIMESTAMP AS ses_datetime
    FROM b_class_bsessionreservation a
    LEFT JOIN b_class_bsession b ON b.id = a.b_session_pk
    WHERE a.is_check_in IS TRUE
    ORDER BY a.b_membership_pk, (b.date || ' ' || b.start_time)::TIMESTAMP ASC
),

-- 멤버십 기본
mbs_base AS (
    SELECT
        mbs.id AS mbs_id,
        mbs.title AS mbs_title,
        mbs.begin_date AS mbs_begin_date,
        mbs.end_date AS mbs_end_date,
        mbs.is_trial,
        mbs.membership_type_id,  -- data_source3.0 필터용 (1=피트니스)
        mbs.refund_transaction_log_id,  -- 멤버십 환불 여부 판단용

        pass.b_place_id,
        txlog.id AS txlog_id,
        tx.id AS tx_id,
        txlog.item_price,
        txlog.is_refund,
        txlog.is_transfer,
        txlog.item_info,
        tx.user_id AS tx_user_id,
        tx.pay_date,
        tx.created AS pay_created,
        tx.is_transfer AS tx_is_transfer,
        tx.final_price,

        place.name AS place_name,
        COALESCE(u_pass.id, u_tx.id) AS user_id,
        COALESCE(u_pass.name, u_tx.name) AS user_name,
        COALESCE(u_pass.phone_number, u_tx.phone_number) AS phone_raw,
        COALESCE(u_pass.gender, u_tx.gender) AS user_gender,
        COALESCE(u_pass.birth_date, u_tx.birth_date) AS user_birth_date,
        cat.name AS category_name,
        -- 세션 정보 (data_source3.0 지원)
        sc.ses_count,
        sf.ses_date,
        sf.ses_datetime,
        -- 크레딧 정보 (체험정규 판정용)
        mpg.default_credit,
        -- 부분결제 여부
        CASE WHEN ut.transaction_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_unpaid_tx,
        -- 환불 실제 금액 (refund txlog의 item_price)
        refund_txlog.item_price AS refund_item_price,
        -- 구독 정보
        mbs.subscription_item_id,
        si.ended_at AS si_ended_at,
        sub.next_billing_date AS sub_next_billing,
        -- 휴회 정보
        CASE WHEN active_hold.membership_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_active_hold,
        -- 제공업체 정보
        txlog.b_provider_names AS provider,
        -- depth2 카테고리 (법인회원 멤버십 판별용)
        cat2.name AS category_depth2

    FROM b_class_bmembership mbs
    LEFT JOIN b_class_bpass pass ON mbs.b_pass_id = pass.id
    LEFT JOIN b_payment_btransactionlog txlog ON mbs.transaction_log_id = txlog.id
    LEFT JOIN b_payment_btransaction tx ON txlog.transaction_id = tx.id
    LEFT JOIN b_payment_bproductitem item ON txlog.item_id = item.id AND txlog.item_type = 'item'
    LEFT JOIN category cat ON cat.id = item.category_id
    LEFT JOIN b_payment_bmaincategory cat2 ON cat2.id = item.category_id AND cat2.depth = 2
    LEFT JOIN b_class_bplace place ON pass.b_place_id = place.id
    LEFT JOIN user_user u_pass ON pass.user_id = u_pass.id
    LEFT JOIN user_user u_tx ON tx.user_id = u_tx.id
    -- 세션 정보 조인 (data_source3.0 지원)
    LEFT JOIN ses_count sc ON sc.mbs_id = mbs.id
    LEFT JOIN ses_first sf ON sf.mbs_id = mbs.id
    -- 크레딧 정보 조인 (PT 체험정규 판정용)
    LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY b_membership_id ORDER BY id ASC) AS rn
        FROM b_class_bmembershipprogramgroup
    ) mpg ON mpg.b_membership_id = mbs.id AND mpg.rn = 1
    -- 부분결제 정보 조인
    LEFT JOIN unpaid_transactions ut ON ut.transaction_id = tx.id
    -- 환불 거래로그 조인 (실제 환불금액 조회용)
    LEFT JOIN b_payment_btransactionlog refund_txlog
        ON mbs.refund_transaction_log_id = refund_txlog.id
    -- 구독 정보 조인
    LEFT JOIN subscription_item si ON si.id = mbs.subscription_item_id
    LEFT JOIN subscription sub ON sub.id = si.subscription_id
    -- 휴회 정보 조인 (현재 활성 휴회만)
    LEFT JOIN (
        SELECT DISTINCT h.membership_id
        FROM b_class_bholding h
        JOIN b_class_bholdinglog hl ON hl.holding_id = h.id
        WHERE hl.is_canceled = FALSE
          AND hl.start_date <= CURRENT_DATE
          AND hl.end_date >= CURRENT_DATE
    ) active_hold ON active_hold.membership_id = mbs.id

    WHERE (cat.name != '정산 집계' OR cat.name IS NULL)  -- 정산 집계 제외 (회차 계산에 영향)
      AND mbs.is_benefit IS NOT TRUE  -- 베네핏(시스템 자동 제공) 멤버십 제외
      AND item.is_benefit IS NOT TRUE  -- 베네핏 상품 제외
),

-- 출석 통계 (멤버십별 체크인 로그 기반, 서브쿼리 DISTINCT 방식으로 최적화)
attendance_stats AS (
    SELECT
        mbs_id,
        COUNT(*) AS 이용일수,
        COUNT(CASE WHEN day >= CURRENT_DATE - 6 THEN 1 END) AS 최근7일출석일수
    FROM (
        SELECT DISTINCT b_membership_id AS mbs_id, created::DATE AS day
        FROM b_checkin_bcheckinmembershiplog
    ) sub
    GROUP BY mbs_id
),

-- 환불/양도 제외 + 체험정규 판정 (회차 계산용)
-- 체험정규: 0원→NULL, 카테고리NULL/대관/홀리데이→NULL, 법인/제휴→NULL, 버핏레이스/다이나핏챌린지→NULL, 피트니스(1일권/일일권)→NULL
mbs_with_trial AS (
    SELECT
        mb.*,
        CASE
            -- 피트니스 법인회원 멤버십 → 정규 (0원/법인 필터보다 먼저 평가)
            WHEN mb.category_name = '피트니스' AND mb.category_depth2 = '법인회원 멤버십' THEN '정규'
            -- 0원 결제 → NULL
            WHEN mb.item_price = 0 THEN NULL
            -- 카테고리 없음 → NULL
            WHEN mb.category_name IS NULL THEN NULL
            -- 대관 → NULL
            WHEN mb.category_name = '대관' THEN NULL
            -- 홀리데이 → NULL
            WHEN mb.category_name = '홀리데이' THEN NULL
            -- 법인/제휴 상품 → NULL (회차 제외)
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') ~* '(법인|제휴|모비스|위메이드)' THEN NULL
            WHEN mb.provider ~* '(베네피아|이지웰|리모트)' THEN NULL
            -- 버핏레이스 → NULL
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%버핏레이스%' THEN NULL
            -- 다이나핏 챌린지 → NULL (챌린지팩은 정규로 유지)
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%다이나핏%챌린지팩%' THEN '정규'
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%다이나핏%'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%챌린지%' THEN NULL
            -- 피트니스: 1일권/일일권 → NULL, 체험권 → 체험, 나머지 → 정규
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%1일%' THEN NULL
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%일일%' THEN NULL
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = '피트니스' THEN '정규'
            -- PT: 10/20/30/40회 → 정규, 체험/크레딧<400 → 체험, 나머지 → 정규
            WHEN mb.category_name = 'PT'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') ~ '(10|20|30|40)회' THEN '정규'
            WHEN mb.category_name = 'PT'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = 'PT'
                 AND mb.default_credit IS NOT NULL AND mb.default_credit < 400 THEN '체험'
            WHEN mb.category_name = 'PT' THEN '정규'
            -- 팀버핏: 체험권 → 체험, 나머지 → 정규
            WHEN mb.category_name = '팀버핏'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = '팀버핏' THEN '정규'
            -- 기타 카테고리: 체험상품 → 체험, 크레딧<400 → 체험, 나머지 → 정규
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.default_credit IS NOT NULL AND mb.default_credit < 400 THEN '체험'
            ELSE '정규'
        END AS 체험정규
    FROM mbs_base mb
    WHERE mb.refund_transaction_log_id IS NULL
        AND mb.is_transfer = FALSE
),

-- 회차 계산 대상: 체험/정규만 (NULL 제외)
mbs_valid AS (
    SELECT * FROM mbs_with_trial
    WHERE 체험정규 IN ('체험', '정규')
),

-- 회차 + 다음 회차 (LEAD 사용) - 카테고리별 (지점별) - 정규+체험 합산
mbs_seq_category_all AS (
    SELECT
        mb.mbs_id,
        ROW_NUMBER() OVER (
            PARTITION BY mb.user_id, mb.b_place_id, mb.category_name
            ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC
        ) AS mbs회차_category_정규체험,
        -- 다음 회차 정보 (LEAD 사용)
        LEAD(mb.mbs_id) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_id,
        LEAD(mb.pay_date) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_결제일,
        LEAD(mb.category_name) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_카테고리,
        LEAD(mb.mbs_title) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_상품명,
        LEAD(mb.item_price) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_가격,
        LEAD(mb.default_credit) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_default_credit,
        LEAD(mb.item_info) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_item_info,
        -- 이전 회차 정보 (LAG 사용) - 신재휴체/전당익미/동시구매 계산용
        LAG(mb.mbs_end_date) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_종료일,
        LAG(mb.체험정규) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_체험정규,
        LAG(mb.pay_date) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_결제일,
        -- 동시구매 판정용: 같은날 같은 카테고리 내 체험/정규 존재 여부
        COUNT(CASE WHEN mb.체험정규 = '체험' THEN 1 END) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name, mb.pay_date) AS same_day_체험_cnt,
        COUNT(CASE WHEN mb.체험정규 = '정규' THEN 1 END) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.category_name, mb.pay_date) AS same_day_정규_cnt
    FROM mbs_valid mb
    WHERE mb.category_name IS NOT NULL
),

-- 회차 - 카테고리별 - 정규만
mbs_seq_category_regular AS (
    SELECT
        mb.mbs_id,
        ROW_NUMBER() OVER (
            PARTITION BY mb.user_id, mb.b_place_id, mb.category_name
            ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC
        ) AS mbs회차_category_정규
    FROM mbs_valid mb
    WHERE mb.category_name IS NOT NULL
      AND mb.체험정규 = '정규'
),

-- 라이프타임 회차 + 다음 회차 정보 (지점별) - 정규+체험 합산
mbs_seq_lifetime_all AS (
    SELECT
        mb.mbs_id,
        ROW_NUMBER() OVER (
            PARTITION BY mb.user_id, mb.b_place_id
            ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC
        ) AS mbs회차_lifetime_정규체험,
        -- 라이프타임 다음 회차 정보 (LEAD 사용)
        LEAD(mb.mbs_id) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_id,
        LEAD(mb.pay_date) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_결제일,
        LEAD(mb.category_name) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_카테고리,
        LEAD(mb.mbs_title) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_상품명,
        LEAD(mb.item_price) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_가격,
        LEAD(mb.default_credit) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_default_credit,
        LEAD(mb.item_info) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs2_all_item_info,
        -- 이전 회차 정보 (LAG 사용) - 동시구매 계산용
        LAG(mb.체험정규) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_all_체험정규,
        LAG(mb.pay_date) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_all_결제일,
        LAG(mb.category_name) OVER (PARTITION BY mb.user_id, mb.b_place_id ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC) AS mbs0_all_카테고리,
        -- 동시구매 판정용: 같은날 같은 user/place 내 PT 체험/정규 존재 여부
        COUNT(CASE WHEN mb.category_name = 'PT' AND mb.체험정규 = '체험' THEN 1 END) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.pay_date) AS same_day_all_pt체험_cnt,
        COUNT(CASE WHEN mb.category_name = 'PT' AND mb.체험정규 = '정규' THEN 1 END) OVER (PARTITION BY mb.user_id, mb.b_place_id, mb.pay_date) AS same_day_all_pt정규_cnt
    FROM mbs_valid mb
),

-- 라이프타임 회차 - 정규만
mbs_seq_lifetime_regular AS (
    SELECT
        mb.mbs_id,
        ROW_NUMBER() OVER (
            PARTITION BY mb.user_id, mb.b_place_id
            ORDER BY mb.pay_date ASC, CASE WHEN mb.체험정규 = '체험' THEN 0 ELSE 1 END ASC, mb.pay_created ASC, mb.txlog_id ASC
        ) AS mbs회차_lifetime_정규
    FROM mbs_valid mb
    WHERE mb.체험정규 = '정규'
),

-- 체험정규 (최종 출력용 - mbs_with_trial과 동일 로직, mbs_base 기준)
mbs_trial_regular AS (
    SELECT
        mb.mbs_id,
        CASE
            -- 피트니스 법인회원 멤버십 → 정규 (0원/법인 필터보다 먼저 평가)
            WHEN mb.category_name = '피트니스' AND mb.category_depth2 = '법인회원 멤버십' THEN '정규'
            -- 0원 결제 → NULL
            WHEN mb.item_price = 0 THEN NULL
            -- 카테고리 없음 → NULL
            WHEN mb.category_name IS NULL THEN NULL
            -- 대관 → NULL
            WHEN mb.category_name = '대관' THEN NULL
            -- 홀리데이 → NULL
            WHEN mb.category_name = '홀리데이' THEN NULL
            -- 법인/제휴 상품 → NULL (회차 제외)
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') ~* '(법인|제휴|모비스|위메이드)' THEN NULL
            WHEN mb.provider ~* '(베네피아|이지웰|리모트)' THEN NULL
            -- 버핏레이스 → NULL
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%버핏레이스%' THEN NULL
            -- 다이나핏 챌린지 → NULL (챌린지팩은 정규로 유지)
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%다이나핏%챌린지팩%' THEN '정규'
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%다이나핏%'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%챌린지%' THEN NULL
            -- 피트니스: 1일권/일일권 → NULL, 체험권 → 체험, 나머지 → 정규
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%1일%' THEN NULL
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%일일%' THEN NULL
            WHEN mb.category_name = '피트니스'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = '피트니스' THEN '정규'
            -- PT: 10/20/30/40회 → 정규, 체험/크레딧<400 → 체험, 나머지 → 정규
            WHEN mb.category_name = 'PT'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') ~ '(10|20|30|40)회' THEN '정규'
            WHEN mb.category_name = 'PT'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = 'PT'
                 AND mb.default_credit IS NOT NULL AND mb.default_credit < 400 THEN '체험'
            WHEN mb.category_name = 'PT' THEN '정규'
            -- 팀버핏: 체험권 → 체험, 나머지 → 정규
            WHEN mb.category_name = '팀버핏'
                 AND COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.category_name = '팀버핏' THEN '정규'
            -- 기타 카테고리: 체험상품 → 체험, 크레딧<400 → 체험, 나머지 → 정규
            WHEN COALESCE(mb.mbs_title, mb.item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
            WHEN mb.default_credit IS NOT NULL AND mb.default_credit < 400 THEN '체험'
            ELSE '정규'
        END AS 체험정규
    FROM mbs_base mb
),

-- 신재휴체 (이전 멤버십 정보 기반 4가지 분류: 신규/체험후전환/재등록/휴면)
mbs_user_status AS (
    SELECT
        mb.mbs_id,
        CASE
            -- 신규: 첫 구매 (카테고리별)
            WHEN seq_cat.mbs회차_category_정규체험 = 1 THEN '신규'
            -- 체험후전환: 이전=체험, 현재=정규, 종료 후 2개월 미만 (lifetime 신규보다 먼저 평가)
            WHEN seq_cat.mbs회차_category_정규체험 > 1
                AND seq_cat.mbs0_체험정규 = '체험'
                AND tr.체험정규 = '정규'
                AND DATE_TRUNC('month', mb.pay_date) < DATE_TRUNC('month', seq_cat.mbs0_종료일) + INTERVAL '2 months'
                THEN '체험후전환'
            -- 신규: 라이프타임 첫 정규 구매 (체험 후 2개월+ 경과 시에만 해당)
            WHEN seq_life_reg.mbs회차_lifetime_정규 = 1 AND tr.체험정규 = '정규' THEN '신규'
            -- 재등록: 이전=정규, 종료 후 2개월 미만
            WHEN seq_cat.mbs회차_category_정규체험 > 1
                AND seq_cat.mbs0_체험정규 = '정규'
                AND DATE_TRUNC('month', mb.pay_date) < DATE_TRUNC('month', seq_cat.mbs0_종료일) + INTERVAL '2 months'
                THEN '재등록'
            -- 휴면: 이전=정규, 종료 후 2개월 이상
            WHEN seq_cat.mbs회차_category_정규체험 > 1
                AND seq_cat.mbs0_체험정규 = '정규'
                AND DATE_TRUNC('month', mb.pay_date) >= DATE_TRUNC('month', seq_cat.mbs0_종료일) + INTERVAL '2 months'
                THEN '휴면'
            -- 휴면: 이전=체험, 현재=정규, 종료 후 2개월 이상
            WHEN seq_cat.mbs회차_category_정규체험 > 1
                AND seq_cat.mbs0_체험정규 = '체험'
                AND tr.체험정규 = '정규'
                AND DATE_TRUNC('month', mb.pay_date) >= DATE_TRUNC('month', seq_cat.mbs0_종료일) + INTERVAL '2 months'
                THEN '휴면'
            ELSE NULL
        END AS 신재휴체
    FROM mbs_base mb
    LEFT JOIN mbs_seq_category_all seq_cat ON mb.mbs_id = seq_cat.mbs_id
    LEFT JOIN mbs_seq_lifetime_regular seq_life_reg ON mb.mbs_id = seq_life_reg.mbs_id
    LEFT JOIN mbs_trial_regular tr ON mb.mbs_id = tr.mbs_id
)

-- 최종 SELECT
SELECT
    mb.place_name AS 지점명,
    mb.user_name AS 회원명,
    CASE
        WHEN LENGTH(mb.phone_raw) = 11 THEN
            CONCAT(SUBSTRING(mb.phone_raw, 1, 3), '-', SUBSTRING(mb.phone_raw, 4, 4), '-', SUBSTRING(mb.phone_raw, 8, 4))
        ELSE mb.phone_raw
    END AS 연락처,
    -- 성별 (f→여성, m→남성)
    CASE
        WHEN mb.user_gender = 'f' THEN '여성'
        WHEN mb.user_gender = 'm' THEN '남성'
        ELSE NULL
    END AS 성별,
    -- 만나이 계산 (2023.6.28 기준 한국 법령)
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, mb.user_birth_date)) AS 만나이,

    -- 결제상태 (부분환불 > 전체환불 > 양도 > 부분결제 > 정상)
    CASE
        WHEN mb.refund_transaction_log_id IS NOT NULL
             AND mb.refund_item_price IS NOT NULL
             AND mb.refund_item_price < mb.item_price THEN '부분환불'
        WHEN mb.refund_transaction_log_id IS NOT NULL THEN '전체환불'
        WHEN mb.is_transfer = TRUE THEN '양도'
        WHEN mb.is_unpaid_tx = TRUE THEN '부분결제'
        ELSE '정상'
    END AS 결제상태,

    mb.pay_date AS 결제일,
    mb.pay_created AS 결제일시,
    -- 세션 정보 (data_source3.0 지원: Organic vs 체험후전환 구분)
    mb.ses_datetime AS 첫세션일시,
    CASE WHEN mb.ses_count IS NULL OR mb.ses_count = 0 THEN TRUE ELSE NULL END AS 세션없음,
    mb.mbs_begin_date AS 시작일,
    mb.mbs_end_date AS 종료일,
    mb.category_name AS 카테고리,
    mb.category_depth2 AS "카테고리_depth2",
    mb.mbs_title AS 상품명,

    -- 가격: 항상 원본 결제금액 (양도는 final_price, 그 외는 item_price)
    CASE
        WHEN mb.tx_is_transfer = TRUE THEN mb.final_price
        ELSE mb.item_price
    END AS 가격,

    -- 환불금액 (실제 환불된 금액, 환불이 아닌 경우 NULL)
    CASE
        WHEN mb.refund_transaction_log_id IS NOT NULL THEN mb.refund_item_price
        ELSE NULL::INTEGER
    END AS 환불금액,

    -- 유효결제금액 (원본가격 - 환불금액, 환불이 아닌 경우 원본 가격)
    CASE
        WHEN mb.refund_transaction_log_id IS NOT NULL AND mb.refund_item_price IS NOT NULL
            THEN mb.item_price - mb.refund_item_price
        WHEN mb.tx_is_transfer = TRUE THEN mb.final_price
        ELSE mb.item_price
    END AS 유효결제금액,

    tr.체험정규,
    mb.provider AS 제공업체,

    -- 구독/기간권 상태 (2026-03-13 추가)
    CASE
        WHEN mb.subscription_item_id IS NOT NULL THEN
            CASE
                WHEN mb.refund_transaction_log_id IS NOT NULL THEN '환불'
                WHEN mb.si_ended_at IS NULL AND mb.mbs_end_date >= CURRENT_DATE THEN '이용 중'
                WHEN mb.si_ended_at IS NULL AND mb.mbs_end_date < CURRENT_DATE THEN '지난 구독'
                WHEN mb.si_ended_at IS NOT NULL AND mb.sub_next_billing > CURRENT_DATE THEN '해지 예약'
                WHEN mb.si_ended_at IS NOT NULL THEN '해지 완료'
                ELSE NULL
            END
        ELSE
            CASE
                WHEN mb.refund_transaction_log_id IS NOT NULL THEN '환불'
                WHEN mb.is_active_hold = TRUE AND mb.mbs_end_date >= CURRENT_DATE THEN '휴회'
                WHEN mb.mbs_end_date >= CURRENT_DATE THEN '이용 중'
                WHEN mb.mbs_end_date < CURRENT_DATE
                     AND DATE_TRUNC('month', mb.mbs_end_date) + INTERVAL '2 months' <= CURRENT_DATE THEN '휴면'
                WHEN mb.mbs_end_date < CURRENT_DATE THEN '만료'
                ELSE NULL
            END
    END AS 이용상태,

    -- 4개 회차 컬럼 (2025-01-31 추가)
    seq_life_all.mbs회차_lifetime_정규체험,
    seq_life_reg.mbs회차_lifetime_정규,
    seq_cat_all.mbs회차_category_정규체험,
    seq_cat_reg.mbs회차_category_정규,

    -- 신재휴체
    us.신재휴체,

    -- 출석 요약
    CASE
        WHEN mb.mbs_begin_date IS NULL OR mb.mbs_end_date IS NULL THEN NULL
        WHEN mb.mbs_begin_date > CURRENT_DATE THEN 0
        ELSE GREATEST(0, LEAST(mb.mbs_end_date, CURRENT_DATE)::DATE - mb.mbs_begin_date::DATE + 1)
    END AS 이용가능일수,
    COALESCE(att.이용일수, 0) AS 이용일수,
    ROUND(
        COALESCE(att.이용일수, 0)::NUMERIC /
        NULLIF(GREATEST(0, LEAST(mb.mbs_end_date, CURRENT_DATE)::DATE - mb.mbs_begin_date::DATE + 1), 0)
        * 100, 1
    ) AS 출석률,
    COALESCE(att.최근7일출석일수, 0) AS 최근7일출석횟수,

    -- 전당익미 (이전 멤버십 종료월 vs 현재 결제월)
    CASE
        -- 전월결제: 이전종료월 = 결제월 - 1
        WHEN DATE_TRUNC('month', seq_cat_all.mbs0_종료일) = DATE_TRUNC('month', mb.pay_date) - INTERVAL '1 month'
            THEN '전월결제'
        -- 당월결제: 이전종료월 = 결제월
        WHEN DATE_TRUNC('month', seq_cat_all.mbs0_종료일) = DATE_TRUNC('month', mb.pay_date)
            THEN '당월결제'
        -- 익월결제: 이전종료월 = 결제월 + 1
        WHEN DATE_TRUNC('month', seq_cat_all.mbs0_종료일) = DATE_TRUNC('month', mb.pay_date) + INTERVAL '1 month'
            THEN '익월결제'
        -- 미래결제: 이전종료월 >= 결제월 + 2
        WHEN DATE_TRUNC('month', seq_cat_all.mbs0_종료일) >= DATE_TRUNC('month', mb.pay_date) + INTERVAL '2 months'
            THEN '미래결제'
        ELSE NULL
    END AS 전당익미,

    -- 다음 회차 (카테고리별) - mbs2_cat_
    seq_cat_all.mbs2_id AS mbs2_cat_id,
    seq_cat_all.mbs2_결제일 AS mbs2_cat_결제일,
    seq_cat_all.mbs2_카테고리 AS mbs2_cat_카테고리,
    -- mbs2 체험정규 (0원/홀리데이/법인제휴/대관/버핏레이스/다이나핏챌린지→NULL, 피트니스(1일권/일일권)→NULL, 피트니스체험→체험)
    CASE
        WHEN seq_cat_all.mbs2_id IS NULL THEN NULL
        -- 0원 → NULL
        WHEN seq_cat_all.mbs2_가격 = 0 THEN NULL
        -- 홀리데이 → NULL (mbs2에는 카테고리 정보가 LEAD로 전달되므로 직접 비교 불가, 상품명으로 판별)
        -- 법인/제휴 상품 → NULL
        WHEN COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') ~* '(법인|제휴|모비스|위메이드)' THEN NULL
        -- 버핏레이스 → NULL
        WHEN COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%버핏레이스%' THEN NULL
        -- 다이나핏 챌린지 → NULL (챌린지팩은 정규로 유지)
        WHEN COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%다이나핏%챌린지팩%' THEN '정규'
        WHEN COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%다이나핏%'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%챌린지%' THEN NULL
        -- 피트니스: 1일권/일일권 → NULL, 체험권 → 체험, 나머지 → 정규
        WHEN seq_cat_all.mbs2_카테고리 = '피트니스'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%1일%' THEN NULL
        WHEN seq_cat_all.mbs2_카테고리 = '피트니스'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%일일%' THEN NULL
        WHEN seq_cat_all.mbs2_카테고리 = '피트니스'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_cat_all.mbs2_카테고리 = '피트니스' THEN '정규'
        -- PT
        WHEN seq_cat_all.mbs2_카테고리 = 'PT'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') ~ '(10|20|30|40)회' THEN '정규'
        WHEN seq_cat_all.mbs2_카테고리 = 'PT'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_cat_all.mbs2_카테고리 = 'PT'
             AND seq_cat_all.mbs2_default_credit IS NOT NULL AND seq_cat_all.mbs2_default_credit < 400 THEN '체험'
        WHEN seq_cat_all.mbs2_카테고리 = 'PT' THEN '정규'
        -- 팀버핏
        WHEN seq_cat_all.mbs2_카테고리 = '팀버핏'
             AND COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_cat_all.mbs2_카테고리 = '팀버핏' THEN '정규'
        -- 기타
        WHEN COALESCE(seq_cat_all.mbs2_상품명, seq_cat_all.mbs2_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_cat_all.mbs2_default_credit IS NOT NULL AND seq_cat_all.mbs2_default_credit < 400 THEN '체험'
        ELSE '정규'
    END AS mbs2_cat_체험정규,
    seq_cat_all.mbs2_상품명 AS mbs2_cat_상품명,
    seq_cat_all.mbs2_가격 AS mbs2_cat_가격,

    -- 동시구매 (카테고리별) - 같은날 같은 카테고리에 체험+정규가 모두 존재하면 동시구매
    CASE
        WHEN mb.category_name = 'PT'
            AND tr.체험정규 IN ('체험', '정규')
            AND seq_cat_all.same_day_체험_cnt > 0
            AND seq_cat_all.same_day_정규_cnt > 0
            THEN '동시구매'
        ELSE NULL
    END AS mbs2_cat_동시구매,

    -- 다음 회차 (라이프타임) - mbs2_all_
    seq_life_all.mbs2_all_id AS mbs2_all_id,
    seq_life_all.mbs2_all_결제일 AS mbs2_all_결제일,
    seq_life_all.mbs2_all_카테고리 AS mbs2_all_카테고리,
    -- mbs2 체험정규 (0원/법인제휴/버핏레이스/다이나핏챌린지→NULL, 피트니스(1일권/일일권)→NULL, 피트니스체험→체험)
    CASE
        WHEN seq_life_all.mbs2_all_id IS NULL THEN NULL
        -- 0원 → NULL
        WHEN seq_life_all.mbs2_all_가격 = 0 THEN NULL
        -- 홀리데이 → NULL
        WHEN seq_life_all.mbs2_all_카테고리 = '홀리데이' THEN NULL
        -- 법인/제휴 상품 → NULL
        WHEN COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') ~* '(법인|제휴|모비스|위메이드)' THEN NULL
        -- 버핏레이스 → NULL
        WHEN COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%버핏레이스%' THEN NULL
        -- 다이나핏 챌린지 → NULL (챌린지팩은 정규로 유지)
        WHEN COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%다이나핏%챌린지팩%' THEN '정규'
        WHEN COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%다이나핏%'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%챌린지%' THEN NULL
        -- 피트니스: 1일권/일일권 → NULL, 체험권 → 체험, 나머지 → 정규
        WHEN seq_life_all.mbs2_all_카테고리 = '피트니스'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%1일%' THEN NULL
        WHEN seq_life_all.mbs2_all_카테고리 = '피트니스'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%일일%' THEN NULL
        WHEN seq_life_all.mbs2_all_카테고리 = '피트니스'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_life_all.mbs2_all_카테고리 = '피트니스' THEN '정규'
        -- PT
        WHEN seq_life_all.mbs2_all_카테고리 = 'PT'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') ~ '(10|20|30|40)회' THEN '정규'
        WHEN seq_life_all.mbs2_all_카테고리 = 'PT'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_life_all.mbs2_all_카테고리 = 'PT'
             AND seq_life_all.mbs2_all_default_credit IS NOT NULL AND seq_life_all.mbs2_all_default_credit < 400 THEN '체험'
        WHEN seq_life_all.mbs2_all_카테고리 = 'PT' THEN '정규'
        -- 팀버핏
        WHEN seq_life_all.mbs2_all_카테고리 = '팀버핏'
             AND COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_life_all.mbs2_all_카테고리 = '팀버핏' THEN '정규'
        -- 기타
        WHEN COALESCE(seq_life_all.mbs2_all_상품명, seq_life_all.mbs2_all_item_info ->> 'description', '') LIKE '%체험%' THEN '체험'
        WHEN seq_life_all.mbs2_all_default_credit IS NOT NULL AND seq_life_all.mbs2_all_default_credit < 400 THEN '체험'
        ELSE '정규'
    END AS mbs2_all_체험정규,
    seq_life_all.mbs2_all_상품명 AS mbs2_all_상품명,
    seq_life_all.mbs2_all_가격 AS mbs2_all_가격,

    -- 동시구매 (라이프타임) - PT 체험↔정규 동시구매 판정 (양방향: LEAD+LAG)
    -- 동시구매 (라이프타임) - 같은날 같은 user/place에 PT 체험+정규가 모두 존재하면 동시구매
    CASE
        WHEN mb.category_name = 'PT'
            AND tr.체험정규 IN ('체험', '정규')
            AND seq_life_all.same_day_all_pt체험_cnt > 0
            AND seq_life_all.same_day_all_pt정규_cnt > 0
            THEN '동시구매'
        ELSE NULL
    END AS mbs2_all_동시구매,

    -- ID 정보 (맨 뒤로 이동)
    mb.user_id,
    mb.tx_id,
    mb.txlog_id,
    mb.mbs_id,
    mb.b_place_id AS place_id,
    mb.membership_type_id,  -- data_source3.0 필터용 (1=팀버핏/모닝패스)
    mb.is_trial  -- data_source3.0 체험정규 판정용

FROM mbs_base mb
LEFT JOIN mbs_seq_category_all seq_cat_all ON mb.mbs_id = seq_cat_all.mbs_id
LEFT JOIN mbs_seq_category_regular seq_cat_reg ON mb.mbs_id = seq_cat_reg.mbs_id
LEFT JOIN mbs_seq_lifetime_all seq_life_all ON mb.mbs_id = seq_life_all.mbs_id
LEFT JOIN mbs_seq_lifetime_regular seq_life_reg ON mb.mbs_id = seq_life_reg.mbs_id
LEFT JOIN mbs_trial_regular tr ON mb.mbs_id = tr.mbs_id
LEFT JOIN mbs_user_status us ON mb.mbs_id = us.mbs_id
LEFT JOIN attendance_stats att ON mb.mbs_id = att.mbs_id

WHERE 1=1
    -- is_benefit 필터는 mbs_base에서 이미 적용됨 (0원 법인 멤버십 포함)
    AND mb.b_place_id NOT IN (3,4,5,6,7,8,12,23)  -- 구지점 제외

ORDER BY
    mb.b_place_id ASC,
    mb.user_id ASC,
    CASE WHEN mb.refund_transaction_log_id IS NOT NULL THEN 1 ELSE 0 END ASC,  -- 환불 아닌 것이 먼저
    mb.pay_date ASC;
