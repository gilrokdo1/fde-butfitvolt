# 데이터 가이드

버핏서울 플랫폼의 **데이터 구조 통합 레퍼런스**입니다.
엔티티 관계, 레플리카 DB 원본 테이블, 스냅샷 테이블을 한 문서로 다룹니다.

---

## 1. 핵심 엔티티 관계도

```
회원 (user_user)
  │
  │ 1:N
  ▼
패스 (b_class_bpass)  ──→  지점 (b_class_bplace)
  │
  │ 1:1
  ▼
멤버십 (b_class_bmembership)  ◀── 핵심 엔티티
  │
  ├── 1:1 → 크레딧 (b_class_bmembershipprogramgroup)
  ├── 1:1 → 결제 (b_payment_btransactionlog)
  ├── 1:1 → 환불 (nullable)
  ├── 1:N → 예약 (b_class_bsessionreservation)
  ├── 1:1 → PT담당 (b_class_bpersonaltraining)
  ├── 1:N → 휴회 (b_class_bholding)
  └── 1:1 → 구독 (subscription_item, nullable)

수업 세션 (b_class_bsession)
  ├── N:1 → 클래스 (b_class_bclass) → 프로그램 (b_class_bprogram)
  ├── M:N → 트레이너 (user_btrainer)
  └── 1:N → 예약 (b_class_bsessionreservation)

카테고리 (b_payment_bmaincategory) ── 자기참조 3단계 계층
```

---

## 2. 레플리카 DB 원본 테이블

레플리카 DB는 **버핏서울 원본 DB의 읽기 전용 복제본**입니다.
스냅샷 테이블(raw_data_*)의 소스 데이터가 됩니다.

### 테이블 네이밍

```
b_class_*       → 수업/멤버십/세션 (비즈니스 코어)
b_payment_*     → 결제/거래
b_checkin_*     → 체크인(출입)
user_*          → 사용자/회원
```

### 주요 테이블 상세

#### user_user — 회원

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `name` | VARCHAR | 이름 |
| `phone_number` | VARCHAR | 연락처 (실질적 식별자) |
| `gender` | VARCHAR | M/F |
| `birth_date` | DATE | 생년월일 |

#### b_class_bpass — 패스

회원 + 지점 연결. 멤버십의 부모.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `user_id` | INT | FK → user_user |
| `b_place_id` | INT | FK → b_class_bplace |

#### b_class_bmembership — 멤버십 (가장 중요)

회원이 구매한 상품 단위.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `b_pass_id` | INT | FK → 패스 (→ 회원, 지점) |
| `title` | VARCHAR | 상품명 |
| `begin_date` | DATE | 시작일 |
| `end_date` | DATE | 종료일 |
| `transaction_log_id` | INT | FK → 결제 거래 |
| `refund_transaction_log_id` | INT | FK → 환불 (nullable) |
| `membership_type_id` | INT | FK → 카테고리 |
| `subscription_item_id` | INT | FK → 구독 (nullable) |

#### b_class_bmembershipprogramgroup — 크레딧

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `b_membership_id` | INT | FK → 멤버십 |
| `default_credit` | INT | 기본 부여 (100 = 1회) |
| `remain_credit` | INT | 잔여. 99999+ = 무제한 |

> 하나의 멤버십에 여러 크레딧 행 가능 → `ROW_NUMBER() = 1`로 첫 행만 사용

#### b_payment_btransactionlog — 거래 로그

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `b_transaction_id` | INT | FK → 거래 그룹 |
| `amount` | INT | 금액 |
| `b_place_id` | INT | FK → 지점 |
| `is_refund` | BOOLEAN | 환불 여부 |
| `is_transfer` | BOOLEAN | 양도 여부 |

#### b_class_bsession — 수업 세션

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `b_class_id` | INT | FK → 클래스 |
| `date` | DATE | 수업 날짜 |
| `start_time` | TIME | 시작 시간 |
| `title` | VARCHAR | 세션명 |
| `b_trainer_names` | TEXT | 트레이너명 |
| `is_private` | BOOLEAN | 1:1 여부 |
| `slot_limit` | INT | 최대 인원 |

#### b_class_bsessionreservation — 예약

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `b_session_id` | INT | FK → 세션 |
| `b_membership_id` | INT | FK → 멤버십 |
| `member_id` | INT | FK → 회원 |
| `is_canceled` | BOOLEAN | 취소 여부 |
| `is_confirmed` | BOOLEAN | 확정 여부 |
| `is_check_in` | BOOLEAN | 출석 여부 |
| `trainer_confirm_status` | VARCHAR | ATTEND/ABSENT/PENDING |
| `user_confirm_status` | VARCHAR | ATTEND/ABSENT/PENDING |

#### b_payment_bmaincategory — 카테고리 (자기참조 계층)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INT | PK |
| `name` | VARCHAR | 카테고리명 |
| `depth` | INT | 1=대분류, 2=중분류, 3=소분류 |
| `parent_id` | INT | FK → self |

#### 기타 테이블

| 테이블 | 설명 |
|--------|------|
| `b_payment_btransaction` | 거래 그룹 (거래로그의 부모) |
| `b_payment_bproductitem` | 결제 시 선택한 상품 정보 |
| `b_class_bclass` | 클래스 (프로그램의 인스턴스) |
| `b_class_bprogram` | 프로그램 (PT, 요가, 팀버핏) |
| `b_class_bprovider` | 제공업체 (입점업체) |
| `b_class_bplace` | 지점 (id, name, is_active) |
| `b_class_bpersonaltraining` | PT 담당 트레이너 |
| `user_btrainer` | 트레이너 (user_user의 서브타입) |
| `b_checkin_bcheckinmembershiplog` | 체크인 기록 |
| `b_class_bholding` | 휴회 기록 |
| `user_bplate` | 플레이트(포인트) |
| `b_class_ptreview` | PT 리뷰 |

---

## 3. 카테고리 체계

```
depth 1 (대분류)
├── PT                    # 개인 트레이닝
│   ├── PT크레딧, PT크레딧대관, PT 10회/20회/30회 ... (depth 2)
│   └── 개별 상품명 (depth 3)
│
├── 피트니스               # 일반 멤버십
│   ├── 피트니스
│   └── 법인회원           ← depth2로 법인 판별
│
├── 팀버핏                 # 그룹 클래스
├── 요가                   # 요가 클래스
├── 임직원/패밀리           # 임직원 혜택
├── 옵션상품               # 락커, 운동복 등
└── 기타                   # 클래스패스, F&B, 굿즈
```

### 체험/정규 판정

```
1. 결제금액 0원 / 카테고리 NULL / 대관 / 홀리데이  → NULL (제외)
2. 임직원/패밀리 / 법인/제휴업체                   → NULL (제외)
3. PT 10/20/30/40회                              → "정규"
4. 피트니스 + 법인회원(depth2)                     → "정규"
5. 상품명에 '체험' 포함                            → "체험"
6. default_credit < 400                          → "체험"
7. 그 외                                         → "정규"
```

### 회차 계산 (신규/기존)

```
한 회원의 멤버십을 시간순 ROW_NUMBER():

lt_신규 = 1 → 전체 이력 첫 등록 (신규)
lt_정규 = 1 → 정규 멤버십 중 첫 번째
cat_신규 = 1 → 해당 카테고리 첫 등록
cat_정규 = 1 → 해당 카테고리 정규 중 첫 번째
```

---

## 4. 스냅샷 테이블 (raw_data_*)

원본 DB의 복잡한 JOIN을 **사전 비정규화**한 분석용 테이블 10개.
PostgreSQL 함수 `refresh_raw_data_*()` 로 **매시 정각** 자동 갱신됩니다.

### 스냅샷 간 관계

```
raw_data_mbs (멤버십 마스터 — 가장 복잡)
  ├──▶ raw_data_activeuser (유효회원 = mbs의 필터된 부분집합)
  ├──▶ raw_data_pt (PT 멤버십 = mbs 중 PT 카테고리)
  ├──▶ raw_data_revenue_cash (매출 현금주의)
  │     └──▶ raw_data_revenue_accrual (매출 발생주의 = 월별 분산)
  └──▶ raw_data_reservation (예약)
        └──▶ raw_data_session (세션 = 예약의 집계)
              └──▶ raw_data_ptreview (리뷰)

raw_data_attendance (체크인 — 독립)
raw_data_plate (포인트 — 독립)
```

### 4.1 raw_data_activeuser — 유효회원

**판정**: `begin_date <= 조회월말 AND end_date >= 조회월초`

| 컬럼 | 설명 |
|------|------|
| `mbs_id` | 멤버십 ID (PK 역할) |
| `user_id` | 회원 ID |
| `place` / `place_id` | 지점 |
| `category` | 피트니스/PT/팀버핏/요가 |
| `begin_date` / `end_date` | 유효 기간 |
| `product_name` | 상품명 |
| `phone_number` | 연락처 |

내장 필터: 환불·양도·베네핏·체험·1일권·이벤트·과거폐점 제외, PT는 4회(400크레딧) 이상만.

> **raw_data_mbs와 혼동 금지!** mbs는 전체, activeuser는 "유효한 것만" 필터된 결과.

### 4.2 raw_data_mbs — 멤버십 마스터

가장 복잡한 스냅샷. 한 행 = 멤버십 1건의 모든 정보.

| 컬럼 | 설명 |
|------|------|
| `membership_id` | PK |
| `user_id`, `place_id` | 식별자 |
| `회원이름`, `연락처` | 기본 정보 |
| `멤버십명`, `멤버십시작일`, `멤버십종료일` | 기간 |
| `category_name` (depth3), `category_depth2` | 카테고리 |
| `payment_amount`, `refund_amount`, `effective_payment` | 결제 |
| `default_credit`, `remain_credit` | 크레딧 |
| `체험정규` | 체험/정규/NULL |
| `이용상태` | 이용중/만료/휴회/환불/휴면 등 |
| `lt_신규`, `lt_정규`, `cat_신규`, `cat_정규` | 회차 |
| `ses_count` | 체크인 횟수 |
| `payment_status` | 정상/환불/부분결제/양도 |

**이용상태 값**: 이용중, 만료, 휴회, 환불, 휴면, 해지예약, 지난, 완료

### 4.3 raw_data_pt — PT 멤버십 상세

| 컬럼 | 설명 |
|------|------|
| `지점명`, `회원이름`, `회원연락처` | 기본 |
| `멤버십명`, `멤버십시작일`, `멤버십종료일` | 기간 |
| `체험정규`, `담당트레이너` | 분류/담당 |
| `총횟수`, `사용횟수`, `잔여횟수` | 크레딧 기반 |
| `다음예약_날짜`, `다음예약_시간` | 가장 가까운 미래 예약 |
| `체험1회_날짜/시간`, `체험2회_날짜/시간` | 체험 수업 |
| `전환재등록` | 체험전환/미전환/재등록/휴면/미등록 |
| `trainer_user_id` | 트레이너 회원 ID |

**전환/재등록 판정**:
- 체험 → 30일 이내 정규 구매? YES = "체험전환", NO = "미전환"
- 정규 → 이전 정규 있음? 30일 이내 = "재등록", 초과 = "휴면", 없음 = "미등록"

**크레딧 → 횟수**: 100크레딧 = 1회, 99999+ = 무제한(NULL)

### 4.4 raw_data_reservation — 수업 예약

| 컬럼 | 설명 |
|------|------|
| `res_id`, `지점명` | 식별 |
| `회원이름`, `회원연락처` | 회원 |
| `수업날짜`, `시작시간`, `수업명`, `트레이너` | 수업 |
| `예약확정`, `예약취소` | 상태 |
| `출석여부` | 출석/결석/불일치/미확정 |
| `멤버십명`, `체험정규` | 멤버십 |
| `총횟수`, `사용횟수`, `잔여횟수` | 누적 (Window Function) |

**출석여부 판정**: PT크레딧 + 시간 경과 + 미취소 → 자동 "출석". 그 외 트레이너/회원 양측 확정 상태로 판정.

### 4.5 raw_data_attendance — 체크인

가장 단순. 실제 출입 기록. 2025-01-01 이후 데이터만.

| 컬럼 | 설명 |
|------|------|
| `datetime` | 체크인 시각 |
| `place_name` | 지점 |
| `user_name`, `phone_number` | 회원 |
| `mbs_title` | 사용한 멤버십 |

### 4.6 raw_data_revenue_cash — 매출 (현금주의)

돈이 들어온 시점 기준.

| 컬럼 | 설명 |
|------|------|
| `결제일` (pay_date) | 매출 인식일 |
| `가격_inVat`, `가격_exVat` | 금액 (부가세 포함/제외) |
| `payment_status` | 정상/환불/부분결제/양도 |
| `매출카테고리` | 아래 참조 |
| `회차_lifetime`, `회차_category` | 신규/기존 |

**매출카테고리 우선순위**: 안심결제 > 대관 > 환불 > 1일권 > 양도수수료 > 법인/제휴 > 옵션(체험/정규) > 체험 > 정규 > 기타

### 4.7 raw_data_revenue_accrual — 매출 (발생주의)

**가장 복잡한 스냅샷**. 결제금액을 계약 기간에 걸쳐 월별 균등 분배.

```
예: 3개월 피트니스 30만원 (4~6월)
  현금주의: 4월에 30만원
  발생주의: 4월 10만 + 5월 10만 + 6월 10만
```

**계약개월 계산**: F&B/옵션 → 1개월, PT → default_credit/8, 피트니스/팀버핏 → 실사용일수/30

**레코드 유형 5가지**:
- A-정상분산: 환불 없는 일반 분산
- B-1-환불(정상분산): 환불월까지만 분산
- B-2-환불(원결제): 시작 전 환불 (환불월에 전액)
- B-3-환불(추가): 계약 범위 밖 환불
- C-환불레코드: 환불 발생월에 전액 음수

### 4.8 raw_data_ptreview — PT 리뷰

| 컬럼 | 설명 |
|------|------|
| `star_point` | 별점 (1~5) |
| `content` | 리뷰 텍스트 |
| `tags` | 선택 태그 (쉼표 구분) |
| `images` | 사진 (JSONB, S3 URL) |
| `photo_count` | 첨부 사진 수 |

### 4.9 raw_data_plate — 플레이트(포인트)

지점별·월별 발행/소비/만료 집계.

| 컬럼 | 설명 |
|------|------|
| `지점명`, `plate_month` | 식별 |
| `total_amount` | 발행 |
| `total_spent` | 소비 |
| `total_expired` | 만료 |
| `total_remain` | 미사용 잔액 |
| `spent_ratio`, `expired_ratio` | 비율(%) |

지점 매핑 3단계 폴백: 체크인 → playlog → 미분류 제외

### 4.10 raw_data_session — 수업 세션 통계

세션 단위 예약/출석 집계.

| 컬럼 | 설명 |
|------|------|
| `session_id`, `지점명`, `수업날짜`, `시작시간` | 식별 |
| `수업명`, `프로그램명`, `트레이너` | 수업 |
| `is_private`, `정원` | 설정 |
| `총예약수`, `유효예약수`, `취소수` | 예약 |
| `출석수`, `결석수`, `미확정수`, `당일취소수` | 출석 |

---

## 5. 공통 SQL 패턴

### 재귀 CTE — 카테고리 계층 탐색

```sql
WITH RECURSIVE category AS (
    SELECT id, name, parent_id, 3 AS depth
    FROM b_payment_bmaincategory WHERE depth = 3
    UNION ALL
    SELECT c.id, parent.name, parent.parent_id, c.depth - 1
    FROM category c
    JOIN b_payment_bmaincategory parent ON c.parent_id = parent.id
    WHERE c.depth > 1
)
```

### 환불 4단계 추적

```
1단계: membership.refund_transaction_log_id (직접 환불)
2단계: transaction.refund_transaction_id (거래 레벨)
3단계: transaction_log.is_refund (플래그)
4단계: 별도 거래로그 역추적
```

### Window Function

```sql
-- 크레딧 첫 행
ROW_NUMBER() OVER (PARTITION BY b_membership_id ORDER BY id) = 1

-- 누적 예약 횟수
COUNT(*) OVER (PARTITION BY membership_id ORDER BY date, time)

-- 회차 계산
ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY begin_date)
```

### 구 지점 제외

```sql
WHERE b_place_id NOT IN (3, 4, 5, 6, 7, 8, 12, 23)
```

### DISTINCT ON

```sql
-- 멤버십별 가장 가까운 미래 예약 1건
SELECT DISTINCT ON (membership_id) *
FROM reservations
WHERE date >= CURRENT_DATE
ORDER BY membership_id, date ASC, start_time ASC
```

---

## 6. 자주 쓰는 쿼리

### 특정 월 유효회원 수 (지점별)

```sql
SELECT place, COUNT(DISTINCT user_id) AS 유효회원수
FROM raw_data_activeuser
WHERE begin_date <= '2026-04-30' AND end_date >= '2026-04-01'
GROUP BY place
```

### PT 잔여횟수 1회 이하 (재등록 타겟)

```sql
SELECT 지점명, 회원이름, 담당트레이너, 잔여횟수, 멤버십종료일
FROM raw_data_pt
WHERE 잔여횟수 <= 1 AND 체험정규 = '정규' AND 멤버십종료일 >= CURRENT_DATE
ORDER BY 잔여횟수
```

### 월별 매출 (현금주의, 카테고리별)

```sql
SELECT DATE_TRUNC('month', 결제일) AS 월, 매출카테고리, SUM(가격_exVat) AS 매출액
FROM raw_data_revenue_cash
WHERE payment_status = '정상'
GROUP BY 1, 2
ORDER BY 1, 3 DESC
```

### 트레이너별 출석률

```sql
SELECT 트레이너,
    COUNT(*) AS 총예약,
    SUM(CASE WHEN 출석여부 = '출석' THEN 1 ELSE 0 END) AS 출석,
    ROUND(100.0 * SUM(CASE WHEN 출석여부 = '출석' THEN 1 ELSE 0 END) / COUNT(*), 1) AS 출석률
FROM raw_data_reservation
WHERE 예약취소 = '유지' AND 수업날짜 >= '2026-04-01'
GROUP BY 트레이너
ORDER BY 출석률 DESC
```

---

## 7. 원본 → 스냅샷 매핑

| 원본 테이블 | 사용하는 스냅샷 |
|------------|----------------|
| `user_user` | 전체 |
| `b_class_bmembership` | activeuser, mbs, pt, reservation, revenue_* |
| `b_class_bpass` | activeuser, mbs, pt, revenue_* |
| `b_payment_btransactionlog` | activeuser, mbs, revenue_* |
| `b_class_bmembershipprogramgroup` | mbs, pt, reservation |
| `b_class_bsession` | pt, reservation, session, ptreview |
| `b_class_bsessionreservation` | pt, reservation, session, ptreview |
| `b_class_bplace` | 전체 |
| `b_payment_bmaincategory` | activeuser, mbs, pt, reservation, revenue_* |
| `b_checkin_bcheckinmembershiplog` | attendance, plate |
| `user_bplate` | plate |
| `b_class_ptreview` | ptreview |
| `b_class_bpersonaltraining` | pt |
| `user_btrainer` | pt, reservation, session |

---

## 8. 주의사항

1. **레플리카 DB는 읽기 전용** — 쓰기 절대 금지
2. **유효회원 조회는 raw_data_activeuser** — raw_data_mbs가 아님
3. **스냅샷 갱신 시간(매시 정각~10분)에는 수정 작업 금지**
4. **크레딧 단위**: 100 = 1회, 99999+ = 무제한
5. **구 지점 ID 제외**: 3, 4, 5, 6, 7, 8, 12, 23
