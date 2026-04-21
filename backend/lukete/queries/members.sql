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
reserved_sess AS (
    -- 예약이력 기반 출석 (참고용) — 취소 제외, 오늘 이전 수업
    SELECT
        sr.b_membership_pk AS mbs_id,
        COUNT(*) AS reserved_count
    FROM b_class_bsessionreservation sr
    WHERE sr.is_canceled = FALSE
      AND sr.b_session_date <= CURRENT_DATE
    GROUP BY sr.b_membership_pk
),
ops_memo AS (
    -- 운영 이슈 메모 (판매 회차 != 등록 회차, 기간 연장, 수동 보정 등)
    SELECT
        b_membership_id AS mbs_id,
        STRING_AGG(
            LEFT(REPLACE(REPLACE(content, E'\r\n', ' / '), E'\n', ' / '), 200),
            ' ‖ ' ORDER BY created DESC
        ) AS memo_preview,
        COUNT(*) AS memo_cnt
    FROM b_class_bmemo
    WHERE is_active = TRUE
      AND (
        content ~* '변경진행|변경 진행|회원권 생성|서비스 진행|추가 서비스|기간 추가|일.*연장|수동|보정'
        OR content ILIKE '%%회원권 생성 되어 있지 않%%'
      )
    GROUP BY b_membership_id
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
    -- 사용 세션 = admin 크레딧 기준 (default - remain) / 100
    -- 크레딧은 체크인 시 자동 차감 + 운영자 수동 보정이 합쳐져서 관리되는 "공식 잔여"
    GREATEST(0,
        FLOOR(COALESCE(mpg.default_credit, 0) / 100)
        - FLOOR(COALESCE(mpg.remain_credit, 0) / 100)
    )                                                          AS used_sessions,
    -- 잔여 세션 = admin remain_credit / 100 (음수 방지)
    GREATEST(0, FLOOR(COALESCE(mpg.remain_credit, 0) / 100))   AS remain_sessions,
    -- 참고용: 예약이력 기반 출석수 (admin 크레딧과 차이 시 운영 이슈 단서)
    COALESCE(rs.reserved_count, 0)                             AS reserved_sessions,
    -- 운영 이슈 메모 (100회→80회 등록 오류, 수동 기간 연장 등)
    COALESCE(om.memo_cnt, 0)                                   AS ops_memo_cnt,
    om.memo_preview                                            AS ops_memo_preview,
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
LEFT JOIN reserved_sess rs ON rs.mbs_id = m.id
LEFT JOIN ops_memo om ON om.mbs_id = m.id
WHERE tl.b_place_id IN %(place_ids)s
  AND tl.is_refund = FALSE
  AND ri.original_log_id IS NULL
  AND m.end_date >= CURRENT_DATE
  AND ct.name = '필라테스'
  AND tl.item_price > 0
ORDER BY m.end_date, u.name;
