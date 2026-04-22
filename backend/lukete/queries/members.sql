-- 루케테80 환불 산정 — 가산점 필라테스 카테고리 전체 유효·미시작 회원
--
-- 참여 분류 (title 기반):
--   '개인'  — 1:1 필라테스 N회      → 약관 제13조 (출석 × 88,000)
--   '그룹'  — 그룹레슨 N회(M개월)   → 약관 제7조 (max(회당 공제, 일할 공제))
--   '특약'  — [특약 ...] 9회권 등   → 유의사항 "할인 등록 회비 환불 불가"
--
-- 바인드 파라미터:
--   %(place_ids)s  : tuple of place_id (예: (20,))
--
-- 제외:
--   - 이미 환불된 거래 (is_refund 또는 refund_info 역참조)
--   - 만료 회원 (end_date < CURRENT_DATE)
WITH RECURSIVE category AS (
    SELECT id, name, parent_id, 1 AS depth
    FROM b_payment_bmaincategory
    WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, ct.name, c.parent_id, ct.depth + 1
    FROM b_payment_bmaincategory c
    JOIN category ct ON c.parent_id = ct.id
),
refund_info AS (
    SELECT original_log_id
    FROM b_payment_btransactionlog
    WHERE is_refund = TRUE
      AND original_log_id IS NOT NULL
),
recent5 AS (
    SELECT
        b_membership_pk AS mbs_id,
        STRING_AGG(d, ', ' ORDER BY ord) AS recent_5
    FROM (
        SELECT
            sr.b_membership_pk,
            TO_CHAR(sr.b_session_date, 'MM-DD') AS d,
            ROW_NUMBER() OVER (
                PARTITION BY sr.b_membership_pk
                ORDER BY sr.b_session_date DESC
            ) AS ord
        FROM b_class_bsessionreservation sr
        WHERE sr.is_canceled = FALSE
          AND (sr.is_check_in = TRUE OR sr.b_session_date < CURRENT_DATE)
    ) s
    WHERE ord <= 5
    GROUP BY b_membership_pk
),
used_sess AS (
    -- 유효예약 수 = 취소되지 않은 예약 중 수업일이 오늘 이전(과거+오늘)인 건
    -- metric_main.sql의 mbs1_remain_today 로직: 크레딧 필드가 아닌 예약 이력으로 산출
    SELECT
        sr.b_membership_pk AS mbs_id,
        COUNT(*) AS used_count
    FROM b_class_bsessionreservation sr
    WHERE sr.is_canceled = FALSE
      AND sr.b_session_date <= CURRENT_DATE
    GROUP BY sr.b_membership_pk
)
SELECT
    p.name                              AS place_name,
    u.name                              AS user_name,
    u.phone_number                      AS phone,
    CASE
        WHEN m.title ILIKE '%%1:1 필라테스%%' THEN '개인'
        WHEN m.title ILIKE '%%그룹레슨%%'     THEN '그룹'
        WHEN m.title ILIKE '%%특약%%'         THEN '특약'
        ELSE '기타'
    END                                 AS participation,
    '회차권'                            AS billing,
    m.title                             AS product_name,
    tl.item_price                       AS purchase_price,
    tx.pay_date                         AS pay_date,
    m.begin_date                        AS begin_date,
    m.end_date                          AS end_date,
    (m.end_date - CURRENT_DATE)         AS d_day,
    FLOOR(COALESCE(mpg.default_credit, 0) / 100)              AS total_sessions,
    LEAST(
        FLOOR(COALESCE(mpg.default_credit, 0) / 100),
        COALESCE(us.used_count, 0)
    )                                                          AS used_sessions,
    GREATEST(0,
        FLOOR(COALESCE(mpg.default_credit, 0) / 100)
        - COALESCE(us.used_count, 0)
    )                                                          AS remain_sessions,
    COALESCE(r5.recent_5, '-')          AS recent_5_sessions,
    pi.price                            AS product_list_price,
    m.id                                AS mbs_id
FROM b_class_bmembership m
JOIN b_payment_btransactionlog tl ON tl.id = m.transaction_log_id
JOIN b_payment_btransaction tx ON tx.id = tl.transaction_id
LEFT JOIN user_user u ON u.id = tx.user_id
LEFT JOIN b_class_bplace p ON p.id = tl.b_place_id
LEFT JOIN b_class_bmembershipprogramgroup mpg ON mpg.b_membership_id = m.id
LEFT JOIN b_payment_bproductitem pi ON pi.id = tl.item_id AND tl.item_type = 'item'
LEFT JOIN category ct ON ct.id = pi.category_id
LEFT JOIN refund_info ri ON ri.original_log_id = tl.id
LEFT JOIN recent5 r5 ON r5.mbs_id = m.id
LEFT JOIN used_sess us ON us.mbs_id = m.id
WHERE tl.b_place_id IN %(place_ids)s
  AND tl.is_refund = FALSE
  AND ri.original_log_id IS NULL
  AND m.end_date >= CURRENT_DATE
  AND ct.name = '필라테스'
  AND tl.item_price > 0
ORDER BY m.end_date, u.name;
