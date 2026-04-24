# 4월 실적 분석 — 작업 이력 & DB 쿼리

> 2026-04-14 작성. 분석 과정에서 발견한 오류, 수정 내역, 검증된 DB 쿼리를 기록.

---

## 1. 발견된 오류 & 수정 이력

### 오류 1: FT 재등록률 대상자 (939명 → 99명으로 잘못 집계)

**원인**: `신재휴체='재등록' AND 전당익미='당월결제'` 필터를 걸어서 대상자를 뽑음
**정답**: 대시보드는 **종료월이 당월인 FT 정규 비구독 전체**가 대상자. 신재휴체/전당익미 필터 없음

```
-- 잘못된 쿼리 (99명)
WHERE 신재휴체 = '재등록' AND 전당익미 = '당월결제' AND 종료월 = 4월

-- 올바른 쿼리 (939명, 대시보드 일치)
WHERE 카테고리='피트니스' AND 체험정규='정규'
  AND 결제상태='정상' AND 가격 > 0
  AND TO_CHAR(종료일,'YYYY-MM') = '2026-04'
  -- 비구독 필터
  AND 상품명 NOT LIKE '%구독%'
  AND 상품명 NOT LIKE '%버핏레이스%'
  AND 상품명 NOT LIKE '%Voucher%'
  AND 상품명 NOT LIKE '%제휴%'
```

**어제까지 대상자**: `AND 종료일 <= '2026-04-13'` 추가 → 482명 (대시보드 일치)

### 오류 2: 구독 이탈률 기준 (4월 전체 vs 어제까지)

**원인**: 종료일 4/1~4/30 전체(2,293명)를 대상으로 이탈률 17.1% 계산
**정답**: 대시보드는 **종료일 ≤ 어제(4/13)**인 926명만 대상. 이탈률 27.0%

```
-- 잘못된 쿼리 (2,293명 → 이탈률 17.1%)
AND 종료일 >= '2026-04-01' AND 종료일 <= '2026-04-30'

-- 올바른 쿼리 (926명 → 이탈률 27.0%, 대시보드 일치)
AND 종료일 >= '2026-04-01' AND 종료일 <= '2026-04-13'
```

### 오류 3: 매출 scope (정규만 vs 전체)

**원인**: FT 정규 + PT 정규(임직원 제외)만 집계 → FT 18,935만 / PT 24,226만
**정답**: 대시보드는 체험/옵션/일일권/법인/환불/대관/안심 등 **모든 항목 포함**

- FT: raw_data_mbs(피트니스 전체) + raw_data_revenue_cash(옵션/일일권/환불)
- PT: raw_data_mbs(PT+대관 전체) + raw_data_revenue_cash(환불/안심)
- 수정 후: FT 27,295만 / PT 26,251만 (대시보드 27,888/26,162와 ~500만 차이 — revenue_cash 매핑 미세 차이)

### 오류 4: 회차별 이탈률 기준

**원인**: 4월 종료분만 뽑아 mbs회차_category_정규 기준으로 계산
**정답**: 대시보드 churn-by-round는 **전체 구독 이력**을 대상으로, user+지점 기준 자체 순번으로 회차를 매기고, 확정된 건만 분모에 포함. 완전히 다른 계산 → 분석 페이지에서 제거

### 오류 5: PT BS 1회차 결제자 (6명 → 3명)

**원인**: BS 1회차 + BS N회차를 합산하여 6명으로 표기
**정답**: BS 1회차만 3명 (simul_regular 제외 후)

### 수정 6: 재등록률 공식

**이전**: 결제자 ÷ (대상자 − 기결제자)
**수정**: (결제자 + 기결제자) ÷ 대상자
**역산출**: 대상자 × 재등록률 − 기결제자 (음수 시 0)

---

## 2. 검증된 DB 쿼리

### 2-1. 지점별 매출 (FT+PT, 대시보드 근사치)

```sql
-- MBS 기반
SELECT "지점명",
    SUM(CASE WHEN "카테고리"='피트니스' THEN "가격" ELSE 0 END)/1.1 AS ft_mbs,
    SUM(CASE WHEN "카테고리" IN ('PT','대관') THEN "가격" ELSE 0 END)/1.1 AS pt_mbs
FROM raw_data_mbs
WHERE "결제일" BETWEEN '2026-04-01' AND '2026-04-13'
  AND "가격" > 0 AND COALESCE("결제상태",'') != '전체환불'
GROUP BY "지점명";

-- revenue_cash 추가분 (옵션/일일권/환불/안심)
SELECT "지점명",
    SUM(CASE WHEN "카테고리" IN ('락커','운동복','옵션상품') THEN "가격_exvat" ELSE 0 END) AS ft_option,
    SUM(CASE WHEN "카테고리"='피트니스' AND "상품명" LIKE '%1일%' AND "결제상태"='정상' THEN "가격_exvat" ELSE 0 END) AS ft_daily,
    SUM(CASE WHEN "카테고리"='피트니스' AND "결제상태"='환불' THEN "가격_exvat" ELSE 0 END) AS ft_refund,
    SUM(CASE WHEN "카테고리"='PT' AND "결제상태"='환불' THEN "가격_exvat" ELSE 0 END) AS pt_refund,
    SUM(CASE WHEN "카테고리"='대관' AND "상품명" LIKE '%안심%' THEN "가격_exvat" ELSE 0 END) AS pt_ansim
FROM raw_data_revenue_cash
WHERE "결제일" BETWEEN '2026-04-01' AND '2026-04-13'
GROUP BY "지점명";

-- 합산: FT = ft_mbs + ft_option + ft_daily + ft_refund
--       PT = pt_mbs + pt_refund + pt_ansim
```

### 2-2. FT BS 1회차 (지점별, 전월/전년 동기간 비교)

```sql
SELECT "지점명",
    COUNT(DISTINCT CASE WHEN "카테고리"='피트니스' AND "체험정규"='정규'
        AND "신재휴체"='신규' AND "mbs회차_lifetime_정규체험"=1
        AND "상품명" NOT LIKE '%제휴%'
        AND "상품명" NOT LIKE '%모비스%'
        AND "상품명" NOT LIKE '%위메이드%'
        THEN mbs_id END) AS bs1
FROM raw_data_mbs
WHERE "결제일" BETWEEN '2026-04-01' AND '2026-04-13'
  AND "가격" > 0 AND COALESCE("결제상태",'') != '전체환불'
GROUP BY "지점명";

-- 전월 동기간: BETWEEN '2026-03-01' AND '2026-03-13'
-- 전년 동기간: BETWEEN '2025-04-01' AND '2025-04-13'
-- 3월 전체: BETWEEN '2026-03-01' AND '2026-03-31'
-- 전년 4월: BETWEEN '2025-04-01' AND '2025-04-30'
```

### 2-3. PT 체험권 (단독 vs 결합)

```sql
-- 전체
SELECT COUNT(DISTINCT mbs_id) AS total
FROM raw_data_mbs
WHERE "카테고리"='PT' AND "체험정규"='체험'
  AND "결제일" BETWEEN '2026-04-01' AND '2026-04-13'
  AND "가격" > 0 AND COALESCE("결제상태",'') != '전체환불';
-- 결과: 188명

-- 결합구매 (같은 날 PT정규 동시결제)
SELECT t."지점명", COUNT(DISTINCT t.mbs_id) AS cnt
FROM raw_data_mbs t
JOIN raw_data_mbs r ON r.user_id = t.user_id AND r."지점명" = t."지점명"
    AND r."카테고리" = 'PT' AND r."체험정규" = '정규'
    AND r."결제일" = t."결제일" AND r.mbs_id != t.mbs_id
WHERE t."카테고리" = 'PT' AND t."체험정규" = '체험'
  AND t."결제일" BETWEEN '2026-04-01' AND '2026-04-13'
  AND t."가격" > 0 AND COALESCE(t."결제상태",'') != '전체환불'
GROUP BY t."지점명";
-- 결과: 12명 (마곡4, 합정3, 강변·도곡·가산·한티·역삼GFC 각1)
```

### 2-4. FT 기간권 재등록률 (대시보드 ft-rereg 동일 조건)

```sql
-- 대시보드는 Python으로 집계함 (행 단위 조회 → _fix_invalid_mbs2 보정 → set 기반 카운트)
-- 핵심 조건:
SELECT "연락처", "상품명", "종료일",
       "mbs2_cat_카테고리", "mbs2_cat_체험정규", "mbs2_cat_결제일", "mbs2_cat_상품명", "mbs2_cat_id"
FROM raw_data_mbs
WHERE "카테고리"='피트니스' AND "체험정규"='정규'
    AND "결제상태" = '정상' AND "가격" > 0
    AND TO_CHAR("종료일",'YYYY-MM') IN ('2026-03', '2026-04', '2026-05');

-- Python에서:
-- 당대당 대상자: 종료월=당월 AND is_non_sub(상품명)
-- 결제자: mbs2가 피트니스 정규이고 mbs2 결제월=당월
-- 기결제자: mbs2 결제월 < 당월
-- 어제까지: 추가로 종료일 <= yesterday 필터
-- is_non_sub: '구독', '버핏레이스', 'Voucher', '제휴' 미포함
-- has_mbs2: mbs2_cat_카테고리='피트니스' AND mbs2_cat_체험정규='정규'

-- 결과 (어제까지): 대상 482, 결제 96, 기결제 54, 재등록률 31.1%
```

### 2-5. 구독 이탈 (어제까지, 대시보드 churn-analysis 동일)

```sql
SELECT "지점명", "이용상태", "종료일",
    mbs_id, user_id, "상품명",
    "mbs2_cat_id", "mbs2_cat_결제일", "mbs2_cat_상품명",
    "mbs2_cat_카테고리", "mbs2_cat_체험정규"
FROM raw_data_mbs
WHERE "카테고리" = '피트니스'
  AND COALESCE("상품명",'') LIKE '%구독%'
  AND "가격" > 0
  AND COALESCE("결제상태",'') != '전체환불'
  AND "종료일" >= '2026-04-01' AND "종료일" <= '2026-04-13';  -- ← 어제까지

-- Python _classify_row 로직:
-- mbs2 없음 + 해지예약 → '해지예정'
-- mbs2 없음 + 해지완료/지난구독/환불 → '이탈'
-- mbs2 없음 + 이용중 → '미확정'
-- mbs2 있음 + 상품명에 '구독' 없음 + 피트니스 정규 → '기간권전환'
-- mbs2 있음 + 상품명에 '구독' 없음 + 그 외 → '이탈'
-- mbs2 있음 + 구독 + 지연 ≤ 1일 → '유지'
-- mbs2 있음 + 구독 + 같은 월 → '당월복귀'
-- mbs2 있음 + 구독 + +1개월 → '익월복귀'
-- mbs2 있음 + 구독 + +2개월 이상 → '휴면복귀'
-- 이탈률 = (이탈 + 해지예정) / 전체

-- 결과: 대상 926, 이탈 250, 이탈률 27.0%
```

### 2-6. PT 체험전환율 (지점별)

```sql
SELECT "지점명",
    COUNT(DISTINCT CASE WHEN "카테고리"='PT' AND "체험정규"='체험'
        AND DATE_TRUNC('month', "종료일") = '2026-04-01'
        AND "상품명" NOT LIKE '%임직원%' AND "상품명" NOT LIKE '%패밀리%'
        THEN "연락처" END) AS 대상자,
    COUNT(DISTINCT CASE WHEN "카테고리"='PT' AND "체험정규"='정규'
        AND ("신재휴체"='체험후전환' OR "mbs2_cat_동시구매"='동시구매')
        AND "결제일" BETWEEN '2026-04-01' AND '2026-04-13'
        AND "상품명" NOT LIKE '%임직원%' AND "상품명" NOT LIKE '%패밀리%'
        THEN "연락처" END) AS 전환자
FROM raw_data_mbs
WHERE "가격" > 0 AND COALESCE("결제상태",'') != '전체환불'
  AND (
    ("카테고리"='PT' AND "체험정규"='체험' AND DATE_TRUNC('month', "종료일") = '2026-04-01')
    OR ("카테고리"='PT' AND "체험정규"='정규' AND "결제일" BETWEEN '2026-04-01' AND '2026-04-13')
  )
GROUP BY "지점명";
-- 결과: 대상 392, 전환 86, 전환율 21.9%
-- 주의: simul_regular CTE 미포함 쿼리라 대시보드와 약간 차이 가능
```

### 2-7. 목표 데이터

```sql
-- butfitvolt DB (safe_db('butfitvolt'))
SELECT branch, category, item, sub_item, metric, SUM(value) AS total
FROM business_plan_targets
WHERE year = 2026 AND month = 4 AND section = '세부실적'
GROUP BY branch, category, item, sub_item, metric;

-- 주요 목표:
-- FT BS 1회차 결제자: 1,190명
-- FT BS 1회차 매출: 18,296만
-- PT 체험권 결제자: 438명
-- PT 체험전환 결제자: 219명
-- PT 체험전환 매출: 27,038만
```

---

## 3. 지표 정의 주요 결정사항

### 재등록률 공식
- **(결제자 + 기결제자) ÷ 대상자 × 100**
- 역산출: 대상자 × 재등록률 − 기결제자 (음수 시 0)

### 재등록 대상자 범위
- 종료월 = **당월 or 익월 or 전월** (당대당/전대당/익대당 각각)
- 신재휴체/전당익미 필터 없이 종료월 기준 전체

### 구독 관련 정의 (subscription.py _classify_row 기반)
- **유지**: 다음 구독 결제 존재 + 지연일수 ≤ 1일
- **복귀**: 다음 구독 결제 존재 + 지연일수 > 1일 (당월/익월/휴면 복귀 구분)
- **기간권전환**: 다음 결제가 피트니스 정규(비구독)
- **이탈**: 다음 결제 없음 + 해지 완료/지난 구독/환불

### PT 체험권 단독 vs 결합
- **단독**: 체험권만 단독 결제 (176명, 94%)
- **결합**: 같은 날 PT 정규권 동시 결제 (12명, 6%)

---

## 4. 대시보드와 차이가 남는 부분 (알려진 한계)

| 항목 | 차이 | 원인 |
|------|------|------|
| 매출 합계 | ~500만 차이 (53,546 vs 54,049) | revenue_cash 일부 항목 매핑 차이 |
| 회차별 이탈률 | 계산 기준 자체가 다름 | 대시보드는 전체 이력 기반 자체 순번, 분석 페이지에서 제거 |
| FT BS1 | 548 vs 대시보드 (미확인) | "(지점 선택)" 2건 포함 여부 차이 가능 |
