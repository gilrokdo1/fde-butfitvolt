# Business Rules

> 시스템의 행동 규칙을 정의하는 문서. 모든 계산식, 플로우, 권한 판단, UI 동작의 Single Source of Truth.
> 데이터 모델(`data-model.md`)이 "무엇을 저장하는가", 이 문서는 "어떻게 행동하는가".

---

## 0. 용어 정리

| 용어 | 정의 |
|---|---|
| **대카테고리** | `account_categories` 레코드. 7개 (경상 소모품, 비경상 소모품, 기타 비용, 세탁, 미화, 파트 인건비, 미정) |
| **소카테고리** | `account_codes` 레코드. 예산/지출이 실제로 귀속되는 단위 |
| **원 예산** | `annual_budgets.amount`. 경영계획 단계에서 책정된 월별 예산 |
| **추경** | `budget_adjustments` 중 `supplementary` 타입. Flex 결재 완료된 추가 편성 |
| **카테고리 전용** | `budget_adjustments` 중 `transfer_out` + `transfer_in` 쌍. 카테고리 간 이동 |
| **실질 예산** | 원 예산 + 승인된 추경 + 카테고리 전용 증가분. 대시보드에 표시되는 값 |
| **지점 직원** | `users.role = 'branch_staff'`. 자기 지점 지출 CRUD + 전체 지점 조회 |
| **본사 관리자** | `users.role` IN (`hq_pm`, `hq_sgm`, `hq_gm`, `hq_planning_lead`) |
| **VAT-** | 부가세 제외 금액 (= VAT+ / 1.1) |
| **VAT+** | 부가세 포함 금액 (시스템의 기본 저장/표시 단위) |
| **귀속월** | `accounting_year` + `accounting_month`. 실제 지출이 "어느 월 예산에 속하는가" |
| **주문일** | `order_date`. 실제 주문한 날짜. 귀속월과 다를 수 있음 |

---

## 1. 예산 계산 규칙

### 1-1. VAT 처리

**저장 기준**: 모든 금액은 **VAT+ (부가세 포함)** 기준으로 저장.
**표시 기준**: 기본 VAT+. 토글로 VAT- 전환 가능 (대시보드 상단 토글).
**변환 공식**:
- `VAT- = round(VAT+ / 1.1)` (원 단위 반올림)
- `VAT+ = round(VAT- × 1.1)` (원 단위 반올림)

**시트 원본 대응**
- 시트는 VAT-와 VAT+를 별도 블록으로 유지
- 시스템은 VAT+만 저장하고 VAT-는 계산으로 도출
- 반올림 차이로 시트 VAT-와 ±1원 오차 가능 → 무시 (집계 시 누적 차이는 무의미)

### 1-2. 실질 예산 계산

특정 지점 × 소카테고리 × 연-월의 실질 예산은:

```
실질 예산(월) = annual_budgets.amount
              + SUM(월 단위 budget_adjustments.adjustment_amount)
              + SUM(해당 월이 속한 분기의 budget_adjustments.adjustment_amount)
```

분기 단위 조정과 월 단위 조정을 모두 합산. `budget_adjustments`는 `quarter` 또는 `month` 중 하나에 값이 들어감:
- 추경(supplementary): 기본 분기 단위 (`quarter`)
- 카테고리 전용(transfer): 월 단위(`month`) 또는 분기 단위 모두 가능

**월 vs 분기 합산 예시**

예 들림 2026년 4월 샤워실/탈의실:
- 원 예산: 297만
- 2Q 추경 200만 (quarter=2) → 2Q 3개월 전체에 +200만 효과 (월별로 안분 X, 분기 총액에 더해짐)
- 4월 전용 +30만 (month=4) → 4월에만 +30만

**분기 예산 = 해당 분기 3개월 원 예산 합 + 분기 단위 조정 + 월 단위 조정 합**

### 1-3. 소진율 계산

```
월 소진율 = 해당 월 실지출 합계 / 해당 월 실질 예산 × 100
분기 소진율 = 해당 분기 실지출 합계 / 분기 실질 예산 × 100
연간 소진율 = YTD 실지출 합계 / 연간 실질 예산 × 100
```

**실지출**: `SUM(expenses.total_amount - expenses.refunded_amount)` WHERE deleted_at IS NULL

**제외 조건**:
- `deleted_at IS NOT NULL` (소프트 삭제)
- `is_pending = TRUE` (미정 카테고리)

### 1-4. 경고 임계값

모든 단위(월/분기/연) 동일한 임계값 적용:

| 상태 | 조건 | UI 표시 |
|---|---|---|
| 정상 | 소진율 < 90% | 배지 없음, 진행바 기본색 |
| 주의 | 90% ≤ 소진율 < 100% | 노란 배지 "주의", 진행바 노란색 |
| 위험 | 소진율 ≥ 100% | 빨간 배지 "초과", 진행바 빨간색 |

**구현 위치** (`app/config/budget_rules.py`):
```python
WARNING_THRESHOLD = 0.9
DANGER_THRESHOLD = 1.0
```

Phase 2에서 UI 설정 가능하게 DB로 이전 예정.

### 1-5. 하드 리밋과 소프트 블록

**분기 100% 도달 시**:
- 해당 소카테고리에 지출 신규 등록 **여전 가능**
- 등록 시 경고 모달 표시:
  > "2Q 샤워실/탈의실 예산이 100% 도달했습니다. 추경 없이 추가 지출이 등록되면 초과 상태가 됩니다. 계속하시겠습니까?"
- "계속" 선택 → 사유 입력 필수 → 등록 진행
- 등록 이후 본사(GM, SGM)에 알림 자동 발송

**추가 지출 블록 안 함**: 실무 현장에서 긴급 지출이 있을 수 있으므로 시스템이 완전 차단은 하지 않음. 경고 + 사유 기록 + 본사 인지로 통제.

---

## 2. 지출 라이프사이클

### 2-1. 지출 상태

| 상태 | 의미 | `refunded_amount` |
|---|---|---|
| `completed` | 정상 지출 (기본값) | 0 |
| `partially_refunded` | 부분 환불 | 0 < x < total_amount |
| `fully_refunded` | 전액 환불 (취소 포함) | = total_amount |

**상태 전이**:
- 생성 시 항상 `completed`로 시작
- 환불 처리 시 → `partially_refunded` 또는 `fully_refunded`
- 환불 취소 시(= 환불을 잘못 처리한 경우) → `completed`로 되돌림 (감사 로그에 기록)
- `cancelled`, `draft` 등의 상태는 존재하지 않음

### 2-2. 지출 등록 플로우

**필수 입력**
- 주문일자 (`order_date`)
- 귀속연월 (`accounting_year`, `accounting_month`)
- 카테고리 (`account_code_id`)
- 품목명 (`item_name`)
- 단가 (`unit_price`)
- 수량 (`quantity`)

**선택 입력**
- 배송비 (`shipping_fee`, 기본 0)
- 비고 (`note`)
- 구매 링크 (`receipt_url`)

**자동 계산/세팅**
- `total_amount` = unit_price × quantity + shipping_fee (트리거)
- `branch_id` = 작성자의 소속 지점 (branch_staff인 경우 자동)
- `created_by` = 현재 로그인 유저
- `status` = 'completed'
- `receipt_confirmed` = FALSE
- `is_pending` = FALSE (단, 카테고리가 "미정"이면 TRUE)

**검증 규칙**
- `unit_price > 0`, `quantity > 0`, `shipping_fee >= 0`
- `accounting_month` ∈ 1..12
- 귀속월이 **5개월 이상 과거**면 경고 (실수 방지). "2026년 1월로 등록하려 합니다. 맞나요?"
- 귀속월이 **미래**면 차단. 단, 한 달 후까지는 허용 (예: 4월에 5월 귀속 등록 가능, 6월 귀속은 차단)

**귀속월 기본값 세팅**
- 주문일자 월을 기본값으로 세팅
- 월말(25일 이후) 주문 시에도 그대로 주문일 월로 세팅 → 사용자가 필요 시 다음 달로 수정

### 2-3. 지출 수정

**권한**
- 자기 지점 지출: 지점 직원, SGM, GM 수정 가능
- 타 지점 지출: 지점 직원은 불가. SGM, GM만 가능
- PM, 운영기획팀 팀장: 수정 불가 (조회만)

**수정 가능 필드**
- 주문일자, 귀속연월, 카테고리, 품목명, 단가, 수량, 배송비, 비고, 링크
- 수령확인 (별도 토글)
- 환불 관련 필드 (환불 처리 화면에서)

**수정 불가 필드**
- `branch_id` (지점 이동은 삭제 후 재등록)
- `created_by`, `created_at`
- `is_migrated`, `migrated_at`
- `status` (직접 수정 불가, 환불 플로우로만 변경)

**수정 시 주의점**
- 모든 수정은 `audit_logs` 기록 (before/after 스냅샷)
- `updated_at` 자동 갱신

### 2-4. 지출 삭제

**권한**: 수정 권한과 동일

**방식**: Soft delete
- `deleted_at`, `deleted_by` 필드에 값 세팅
- 실제 DELETE 하지 않음
- 모든 집계 쿼리에서 `deleted_at IS NULL` 필터 적용

**삭제 시 사유 입력 필수**
- 감사 로그의 `reason` 필드로 기록

**복원 가능**
- SGM 이상만 가능
- `deleted_at = NULL`로 되돌림 + 감사 로그 기록

### 2-5. 환불 처리

**플로우**
1. 원본 지출 상세에서 "환불 처리" 버튼
2. 모달:
   - 환불 금액 입력 (기본값: 전액, 부분이면 수정)
   - 환불 사유 입력 (필수)
3. 저장 시:
   - `refunded_amount` = 입력값
   - `refunded_at` = 현재 시각
   - `refunded_by` = 현재 유저
   - `refund_reason` = 입력값
   - `status`:
     - `refunded_amount = total_amount` → `fully_refunded`
     - `0 < refunded_amount < total_amount` → `partially_refunded`

**제약**
- `refunded_amount`는 0 이상 `total_amount` 이하
- 이미 환불 처리된 지출에 재환불 불가 (취소 후 다시 처리)

**환불 취소**
- 환불 처리가 잘못된 경우 "환불 취소" 버튼으로 되돌림
- `refunded_amount = 0`, `status = 'completed'`로 복귀
- 감사 로그에 기록

### 2-6. 수령 확인

**플로우**
- 기본값: `receipt_confirmed = FALSE`
- 지출 목록 또는 상세에서 체크박스로 토글
- 체크 시 `receipt_confirmed_at = now()`
- 해제 시 `receipt_confirmed_at = NULL`

**지연 플래그**
- **주문일 + 7일 경과 + `receipt_confirmed = FALSE`** → "주의" 배지 표시
- `is_long_delivery = TRUE`인 경우 기준 14일로 확장
- 이관 데이터(`is_migrated = TRUE`)는 자동 수령 완료 처리 (이관 시 일괄)

**UI 표시**
- 지출 목록에 해당 행에 "배송 확인 필요" 배지
- 지점 대시보드에 "수령 대기" 위젯의 카운트
- 재전 알림 없음 (배지로 충분)

---

## 3. 미정 카테고리 플로우

### 3-1. 등록 시

**지출 등록 폼에서 카테고리 선택**
- 드롭다운 최상단에 정식 카테고리들
- 맨 아래에 "미정 (추후 분류)" 옵션

**"미정" 선택 시**
- 추가 입력: "미정 사유" (필수, 텍스트)
- 예: "에어컨 미디어필터 구매. 기존 카테고리 매칭 어려움."

**저장 시**
- `is_pending = TRUE`
- `account_code_id = <pending_uncategorized의 id>`
- `pending_reason = <입력값>`
- `notifications`에 알림 레코드 생성 (대상: SGM, GM)

### 3-2. 본사 재분류 화면

**접근**: SGM 또는 GM 권한

**뷰**
- "미정 대기 목록" 섹션
- 지점 / 일자 / 품목 / 금액 / 등록자 / 사유 컬럼
- 등록 오래된 순 정렬

**재분류 액션**
1. 대상 건 클릭
2. 정식 카테고리 드롭다운 노출
3. 선택 + "확정" 클릭
4. 시스템 처리:
   - `original_account_code_id` = 기존 pending id (추적용)
   - `account_code_id` = 선택된 정식 id
   - `is_pending = FALSE`
   - `reclassified_at = now()`
   - `reclassified_by = 현재 유저`
   - 감사 로그 기록
   - 예산 집계에 즉시 편입

### 3-3. 방치 방지

**N일 경과 재알림**
- 미정 상태 3일 경과 → SGM에게 재알림
- 7일 경과 → GM에게 추가 알림

**본사 대시보드 KPI**
- "미정 대기 중 누적 금액" 상시 노출
- 10건 초과 시 빨간 배지

### 3-4. 예산 집계 영향

**소속 집계**
- 미정 카테고리 건은 어느 카테고리에도 포함 안 됨
- 본사 뷰에 "미정 누적 XX만" 별도 KPI
- 지점 전체 지출 = 정식 카테고리 합 + 미정 (지점 대시보드 상단에 분리 표시)

**재분류 후**
- 재분류된 건은 **원래 귀속월**로 소급 반영
- 예: 4월 등록 → 5월에 재분류 → 4월 예산에 소급 합산
- 이로 인해 4월 소진율이 사후 변경될 수 있음 (UI에 재계산 안내)

---

## 4. 추경 규칙

### 4-1. 개요

**외부 결재**: 추경 검토·승인은 **Flex 플랫폼에서 처리**. 시스템은 결재 결과를 입력받는 역할만 한다.

**권한**: GM만 입력 가능. SGM, PM, 운영기획팀 팀장 모두 조회만 가능.

### 4-2. 입력 플로우

**GM이 본사 뷰에서**
1. "추경 입력" 버튼
2. 폼:
   - 지점 선택
   - 소카테고리 선택
   - 연도 / 분기 선택
   - 금액 (양수)
   - 사유 (텍스트)
   - Flex 결재 참조번호 (선택, 권장)
3. 저장 시:
   - `budget_adjustments` 레코드 INSERT
   - `adjustment_type = 'supplementary'`
   - `quarter = 선택값`, `month = NULL`
   - `adjustment_amount = 양수`
   - `flex_approval_ref = 입력값`
   - `created_by = GM user_id`
   - 해당 지점의 담당자(branch_staff)에게 알림

### 4-3. 자동 감지 (경고만)

**분기 소진율 ≥ 90% 도달 시**
- 본사 뷰 대시보드 배너: "[지점명] [카테고리] 2Q 92% 소진 → 추경 검토 필요"
- 지점 뷰에도 동일 배너
- **액션 버튼 없음** (Flex에서 처리)

### 4-4. 추경 취소/수정

**실수 입력 시**
- GM만 수정 또는 삭제 가능
- 수정: 금액/사유 변경, 감사 로그 기록
- 삭제: 소프트 삭제는 아니고, 예산 집계에서 완전 제외돼야 하므로 DELETE 실행 + 감사 로그에 스냅샷 보존

---

## 5. 카테고리 전용 규칙

### 5-1. 개요

**목적**: 같은 지점 내에서 카테고리 A의 잉여 예산 일부를 카테고리 B로 이동

**트리거**: 지점 직원이 요청

**승인**: GM 또는 운영기획팀 팀장

### 5-2. 요청 플로우

**지점 직원이 예산 뷰에서**
1. "카테고리 전용 요청" 버튼
2. 폼:
   - 출처 카테고리 선택
   - 대상 카테고리 선택
   - 금액 (양수)
   - 전용 단위: 월 or 분기
   - 사유 (필수)
3. 저장 시:
   - **보류 상태로 저장** (승인 대기)
   - → MVP 기준: 바로 `budget_adjustments`에 레코드 2개 INSERT
   - 승인 필요한 경우 `status` 필드로 관리하는 별도 확장 가능 (Phase 2)

**단순화 제안 (MVP)**
- 전용 요청을 "승인 대기" 상태로 별도로 두지 않고, 권한자가 직접 입력
- 지점 직원이 요청 → 슬랙/메신저로 권한자에 컨택 → 권한자가 시스템에서 직접 입력
- Flex 같은 외부 결재 대상이 아니므로 시스템 내 입력 UI만 제공

### 5-3. 실행 (권한자 입력)

**GM 또는 운영기획팀 팀장이 본사 뷰에서**
1. "카테고리 전용 입력" 버튼
2. 폼:
   - 지점 선택
   - 출처 카테고리 + 대상 카테고리 선택
   - 연/월/분기
   - 금액
   - 사유
3. 저장 시 **트랜잭션으로 2개 레코드 동시 생성**:
   - 레코드 A (출처):
     - `adjustment_type = 'transfer_out'`
     - `adjustment_amount = -금액`
     - `source_account_code_id = 출처`, `target_account_code_id = 대상`
   - 레코드 B (대상):
     - `adjustment_type = 'transfer_in'`
     - `adjustment_amount = +금액`
     - `source_account_code_id = 출처`, `target_account_code_id = 대상`
   - 두 레코드 `transfer_pair_id`로 서로 연결

### 5-4. 제약

- 출처 카테고리의 해당 시점 잉여 예산 ≥ 요청 금액 (검증 필요)
- 출처와 대상은 서로 다른 카테고리
- 분기 단위 전용과 월 단위 전용 혼용 가능 (단일 요청 내에서는 한 단위)

---

## 6. 권한 규칙

### 6-1. 역할 정의

| Role | 설명 |
|---|---|
| `branch_staff` | 지점 직원. `user_branch_memberships`로 소속 지점 지정 |
| `hq_pm` | 본사 PM. 조회 전담 |
| `hq_sgm` | 본사 SGM. 운영 개입 권한 (카테고리 재분류, 타 지점 수정) |
| `hq_gm` | 본사 GM. 예산/추경/마스터 전권 |
| `hq_planning_lead` | 운영기획팀 팀장. 카테고리 전용 승인 권한 |

### 6-2. 권한 매트릭스

| Permission | staff | pm | sgm | gm | planning_lead |
|---|:---:|:---:|:---:|:---:|:---:|
| `expense.create` (자기 지점) | ✓ | | | | |
| `expense.read.own_branch` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `expense.read.all_branches` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `expense.update.own_branch` | ✓ | | ✓ | ✓ | |
| `expense.update.other_branches` | | | ✓ | ✓ | |
| `expense.delete.own_branch` | ✓ | | ✓ | ✓ | |
| `expense.refund` | ✓ | | ✓ | ✓ | |
| `expense.restore_deleted` | | | ✓ | ✓ | |
| `pending_category.reclassify` | | | ✓ | ✓ | |
| `budget.read.all` | | ✓ | ✓ | ✓ | ✓ |
| `budget.revise` (원 예산 수정) | | | | ✓ | |
| `budget.adjustment.create` (추경 입력) | | | | ✓ | |
| `budget.transfer.create` (카테고리 전용 입력) | | | | ✓ | ✓ |
| `branch.manage` | | | | ✓ | |
| `category.manage` | | | ✓ | ✓ | |
| `user.manage` | | | | ✓ | |
| `audit_log.read` | | | ✓ | ✓ | |

### 6-3. 지점 소속 판정

**branch_staff가 "자기 지점"이라고 판단되려면**:
- `user_branch_memberships`에 (user_id, branch_id) 레코드 존재

**다지점 소속 가능**
- 1명의 branch_staff가 여러 지점에 소속 가능 (매니저급)
- 그 경우 속한 모든 지점에서 `expense.update.own_branch` 등 권한 허용

### 6-4. 조회 권한

**staff의 타 지점 조회**
- 전체 지점 지출/예산 데이터 조회 가능
- 수정/삭제 불가, 환불 불가
- UI에서 타 지점 선택 시 "읽기 전용" 안내

**이유**: 투명성, 지점 간 벤치마크. 단, 편집은 자기 지점만.

### 6-5. 감사 로그 접근

**조회 권한**: SGM, GM

**자기 이력 조회**: 모든 유저가 본인이 수행한 액션 이력은 조회 가능 (개인정보 원칙)

---

## 7. 감사 로그 규칙

### 7-1. 기록 대상 액션

**지출 관련**
- `expense.create`
- `expense.update`
- `expense.delete`
- `expense.restore`
- `expense.refund`
- `expense.refund_cancel`
- `expense.receipt_confirm` (수령확인 토글)
- `expense.reclassify` (미정 → 정식)

**예산 관련**
- `budget.revise` (원 예산 수정)
- `budget.adjustment.create` (추경 입력)
- `budget.adjustment.update`
- `budget.adjustment.delete`
- `budget.transfer.create` (카테고리 전용)

**마스터 관련** (Phase 2)
- `branch.create`, `branch.update`
- `category.create`, `category.update`
- `user.create`, `user.update`, `user.deactivate`

### 7-2. 스냅샷 저장

**before / after 모두 저장**
- 생성 액션: `before_snapshot = NULL`, `after_snapshot = 전체 레코드`
- 수정 액션: 둘 다 저장
- 삭제 액션: `before_snapshot = 전체 레코드`, `after_snapshot = NULL`

**스냅샷 구조**
- JSONB로 전체 레코드 직렬화
- 민감 정보(password_hash 등) 제외
- 날짜/시간은 ISO 8601 문자열

### 7-3. 액터 정보

- `actor_user_id`: 액션 수행한 유저
- `actor_role`: 액션 시점의 역할 (스냅샷, 추후 role 변경 시에도 당시 role 보존)

### 7-4. 보존 정책

- MVP: 영구 보존
- Phase 3 이후: 2년 초과 데이터 아카이빙 정책 검토

---

## 8. 이관 데이터 규칙

### 8-1. 대상 범위

**1~4월 전체 상세 이관**
- 12개 지점 × 약 2,500~3,000건 지출
- 12개 지점 × 10카테고리 × 12월 = 1,440 예산 레코드
- 분기 추경 이력 (예 들림 1Q 169만, 23만 등)

### 8-2. 이관 플래그

모든 이관 데이터에:
- `is_migrated = TRUE`
- `migrated_at = <이관 실행 시각>`

**효과**
- 감사 로그 미기록 (이관은 audit 대상 아님)
- 수령확인 자동 TRUE 처리
- 지연 플래그 자동 제외
- 삭제/수정 가능 (단, 주의 필요)

### 8-3. 이관 실행 플로우

**사전**
1. 12개 지점 시트 수집
2. 포맷 점검 (카테고리명, 월 블록, 필드 누락)
3. 데이터 품질 점검 (미입력, 중복 의심)

**실행** (Python 스크립트)
1. 파일럿: 신도림부터 이관 실행
2. 이관 직후 검증 쿼리:
   - 월별 합계 = 시트 대시보드 월별 합계
   - 카테고리별 합계 = 시트 카테고리별 합계
3. 불일치 시 건별 추적, 수정 후 재실행
4. 나머지 11개 지점 순차 실행

**저장 방침**
- 카테고리 미입력 → "미정" 카테고리로 이관 (`is_pending = TRUE`)
- 수령확인 누락 → TRUE 처리 (이관 데이터는 과거)
- 중복 의심 → 그대로 이관, 플래그만 기록
- 작성자명 → `users.name` 매칭. 못 찾으면 시스템 계정으로 귀속

### 8-4. 이관 이후

**읽기 전용 취급 권장**
- 이관 데이터 수정은 가능하되, 원칙적으로 하지 않음
- 오타 등 명백한 경우만 수정

**통계 일관성**
- 시스템 이전 시점 "2026년 YTD 지출"은 이관 데이터 + 신규 데이터 합산
- 시스템이 시트 대시보드 값을 완전히 대체

---

## 9. 중복 감지 규칙

### 9-1. 판정 기준

**같은 조건의 지출이 N회 이상 등록 시**
- 같은 지점
- 같은 일자 (`order_date`)
- 같은 품목명 (`item_name`, 공백 trim + 대소문자 무시)
- 같은 단가 (`unit_price`)
- 같은 수량 (`quantity`)
- 같은 작성자 (`created_by`)

**기본 임계값 N = 3**

### 9-2. 경고 플로우

**3회째 등록 시도**
- 모달 노출: "오늘 이 품목을 3번째 등록하셨네요. 중복이 아닌지 확인하세요."
- 동일 조건 기존 레코드 2건 요약 표시 (시간, 작성자)
- 버튼: "그래도 등록" / "돌아가기"
- "그래도 등록" 선택 시 `duplicate_warnings`에 로그

### 9-3. 적용 제외

- 이관 데이터 (`is_migrated = TRUE`)는 감지 대상 아님
- 수정 시도 감지 안 함 (신규 등록시만 적용)

### 9-4. 분석

제 1회 본사 대시보드에 "중복 경고 발생 TOP 10 품목" 표시 (Phase 2 고려).

---

## 10. 품목 마스터 자동화

### 10-1. 자동 생성

**지출 등록 시 트리거**
- `product_catalog`에 (branch_id, item_name) 매칭 없으면 INSERT
- 매칭 있으면 UPDATE:
  - `default_unit_price = 신규 입력값` (최근가 덮어쓰기)
  - `default_url = 신규 입력값`
  - `order_count += 1`
  - `last_ordered_at = now()`

### 10-2. 자동완성

**지출 등록 폼**
- `item_name` 입력 필드에 2자 이상 입력 시 자동완성 드롭다운
- 매칭: `product_catalog WHERE branch_id = 현재 지점 AND name LIKE '%input%' ORDER BY order_count DESC LIMIT 10`
- 선택 시:
  - `item_name` = 선택한 name
  - `unit_price` = default_unit_price (수정 가능)
  - `account_code_id` = default_account_code_id (있는 경우)
  - `receipt_url` = default_url (있는 경우)
  - `note` = default_note (있는 경우)

### 10-3. 수동 편집

- 품목 마스터 관리 화면에서 수정/삭제 가능
- 지점 직원: 자기 지점 품목만
- SGM, GM: 모든 지점 품목

### 10-4. 이관 시

1~4월 지출 이관 완료 후:
- 각 지점별 `DISTINCT item_name` 추출
- 품목 마스터 자동 생성 (order_count는 실제 등장 횟수로 세팅)
- 예상: 지점당 60~80개 품목

---

## 11. 알림 규칙

### 11-1. 알림 종류

| 종류 | 트리거 | 대상 |
|---|---|---|
| `pending_category_created` | 미정 카테고리로 지출 등록 | SGM, GM |
| `pending_category_stale` | 미정 상태 3일/7일 경과 | SGM / GM |
| `budget_warning_monthly` | 월 90% 도달 | 지점 + 본사 |
| `budget_danger_monthly` | 월 100% 초과 | 지점 + 본사 |
| `budget_warning_quarterly` | 분기 90% 도달 | 지점 + 본사 |
| `budget_danger_quarterly` | 분기 100% 초과 | 지점 + 본사 (GM 강조) |
| `budget_adjustment_created` | 추경 입력 완료 | 지점 담당자 |
| `budget_transfer_created` | 카테고리 전용 실행 | 출처/대상 지점 담당자 |

### 11-2. 전달 채널

**MVP (Phase 1)**: 시스템 내 알림 센터만
- `notifications` 테이블 기록
- 헤더 종 아이콘에 미읽은 카운트

**Phase 2**: 슬랙 연동
- 특정 `notification_type`은 슬랙 DM 또는 채널 발송
- 슬랙 발송 여부는 `notification_type`별로 설정 (config)

### 11-3. 중복 방지

같은 조건으로 24시간 이내 동일 알림 생성 제한.
예: "샤워실 월 90% 도달" 알림 한 번 발송 후 다시 92% 도달해도 재알림 X. 100% 도달 시에만 새 알림(`budget_danger_monthly`).

---

## 12. 연말 결산 규칙

### 12-1. MVP 방침

- 연말 잉여 예산 이월/재분배 **없음**
- 2026년 예산과 2027년 예산은 독립
- 매년 경영계획 기반으로 원 예산 책정

### 12-2. 연말 락

**Phase 2 이후 추가**
- GM이 특정 연도 마감 처리 → `annual_budgets.is_locked = TRUE`
- 락 이후 해당 연도 예산 수정 불가
- 해당 연도 지출도 수정 불가 (사후 편집 방지)
- 조회는 계속 가능

---

## 13. 데이터 정합성 규칙

### 13-1. 트랜잭션 경계

**단일 트랜잭션으로 처리해야 하는 액션**
- 카테고리 전용 입력 (레코드 2개 동시 INSERT)
- 미정 재분류 (expenses UPDATE + audit log + notifications)
- 지출 환불 처리 (expenses UPDATE + audit log)
- 추경 입력 (budget_adjustments INSERT + notifications)

### 13-2. 금액 검증

**소진율 계산 시**
- 음수 소진 불가 (refund이 지출보다 크면 데이터 이상)
- 월별 집계 결과가 음수면 경고 로그 + 본사 알림

### 13-3. 외래키 무결성

- 소프트 삭제된 `expenses`를 참조하는 FK는 허용 (감사 추적)
- `deleted_at IS NOT NULL`인 expense를 `budget_adjustments.original_expense_id`로 참조 가능

---

## 14. 다음 단계

- `edge-cases.md`: 11개 엣지 케이스 + 5개 구체화 결정 이력
- `screens.md`: 이 룰이 어떻게 화면에 구현되는지
- `api-spec.md`: 이 룰이 어떻게 API 엔드포인트로 표현되는지

---

## 15. 변경 이력

| 일자 | 변경 | 작성자 |
|---|---|---|
| 2026-04-20 | 초안 작성 (엣지 케이스 11개 + B영역 5개 결정 반영) | PM |
