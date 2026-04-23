# 트레이너 관리 지표 문서

> 페이지: https://fde.butfitvolt.click/fde/kim-dongha/trainers
> 백엔드: `backend/fde/routers/dongha_trainers.py`, `backend/fde/utils/trainer_queries.py`
> 스냅샷 잡: `backend/fde/jobs/trainer_snapshot.py` (매일 새벽 5시 KST)
> 작성: 2026-04-22 (FDE 1기 김동하)

영업기획팀이 PT 트레이너의 영업·운영 성과를 평가하고 재계약 여부를 판단하기 위한 대시보드.

---

## 1. 데이터 소스

| 출처 | 테이블 | 용도 |
|---|---|---|
| **replica DB** | `raw_data_pt` | PT 멤버십 상세 (시작/종료일·총횟수·사용횟수·전환재등록·담당트레이너 등) |
| **replica DB** | `raw_data_reservation` | PT 수업 예약 (수업날짜·예약취소·출석여부·트레이너) |
| **replica DB** | `user_user`, `user_btrainer` | 트레이너 디렉토리 (id ↔ 이름) |
| **FDE DB** | `dongha_trainer_monthly` | 월별 4개 지표 스냅샷 |
| **FDE DB** | `dongha_trainer_completion` | 완료 멤버십 per-row 스냅샷 (cohort 집계용) |
| **FDE DB** | `dongha_trainer_criteria` | 평가 기준값 (singleton, id=1) |
| **FDE DB** | `dongha_trainer_excluded` | 직원 등 평가 제외 명단 |

⚠️ **`raw_data_pt` 에 없는 컬럼**: `결제상태`, `회원이름` 외 일부. `결제상태` 는 `raw_data_mbs` 에만 있음. 새 쿼리 작성 시 `프로젝트 가이드/DATA-GUIDE.md` 4.3 절 컬럼 목록 확인 필수.

---

## 2. 트레이너·지점 단위 처리 규칙

| 항목 | 규칙 |
|---|---|
| **집계 키** | `(trainer_user_id, branch)` — 같은 이름·다른 ID 인 경우 별도 카운트 (raw_data_pt 의 trainer_user_id 가 진실) |
| **표시 키** | `(TRIM(trainer_name), TRIM(branch))` — 동일 이름+동일 지점의 여러 trainer_user_id는 한 행으로 병합. 공백 변이 정규화 |
| **다지점 트레이너** | 지점별 행 분리 (legitimately 다 지점 활동) |
| **이름 fallback** | trainer_name NULL 이면 `#<id>` 로 임시 키 부여 (다른 키와 안 묶이게) |
| **매칭 안정성** | overview 가 `dongha_trainer_completion` 과 join 할 때는 **trainer_user_id 기반** 으로 매칭. 이름 매칭은 fallback 차이로 누락 발생 |

---

## 3. 지표 정의

### ① 유효회원 (월 평균)
- **출처**: `raw_data_pt`
- **정의**: 월말 시점에 유효한 정규 PT 멤버십 회원 수 (월별 집계 후 평균)
- **수식**:
  ```sql
  per month: COUNT(DISTINCT 회원연락처)
  WHERE 체험정규 = '정규'
    AND 멤버십시작일 ≤ 월말 AND 멤버십종료일 ≥ 월초
    AND 총횟수 < 99999     -- 무제한권 제외
    AND trainer_user_id IS NOT NULL
  GROUP BY trainer_user_id, 지점명
  ```
- **기간 평균** = `SUM(월별 회원수) / 기간 월 수`
- **기준**: `≥ active_members_min` (기본 15명)

### ② 월 세션 (월 평균)
- **출처**: `raw_data_reservation`
- **정의**: 유지된 PT 세션 수 — **결석 포함** (ERP /pt/trainer 동일 기준)
- **수식**:
  ```sql
  per month: COUNT(*)
  FROM raw_data_reservation r
  JOIN user_user uu ON uu.name = r."트레이너"
  JOIN user_btrainer bt ON bt.user_id = uu.id
  WHERE r.수업날짜 BETWEEN 월초 AND 월말
    AND r.예약취소 = '유지'      -- 결석은 유지된 예약 (취소만 제외)
    AND r.프로그램명 = 'PT'
  GROUP BY bt.id, r.지점명
  ```
- **트레이너 귀속**: `raw_data_reservation.트레이너` 텍스트 → `user_user.name` 조인 → `user_btrainer.id` 매핑 (raw_data_reservation 에 trainer_user_id 직접 컬럼 없음)
- **왜 결석 포함**: 회계상 크레딧 차감 이벤트 = 트레이너 기여 세션. 회원 노쇼여도 트레이너는 대기·준비한 것으로 간주 (ERP 기준).
- **기준**: `≥ sessions_min` (기본 120회)

### ③ 체험전환율 (기간 누적)
- **출처**: `raw_data_pt`
- **정의**: 기간 중 체험권이 종료된 회원 중 `전환재등록='체험전환'` 인 비율
- **수식**:
  ```
  분모 = COUNT(DISTINCT 회원연락처)
         WHERE 체험정규='체험' AND 멤버십종료일 ∈ 기간
  분자 = COUNT(DISTINCT 회원연락처)
         WHERE 체험정규='체험' AND 멤버십종료일 ∈ 기간
           AND 전환재등록='체험전환'
  rate = 분자 / 분모 × 100
  ```
- **`전환재등록='체험전환'` 정의** (DATA-GUIDE 기준): 체험 종료 후 30일 이내 정규 PT 구매
- **귀속**: 체험 멤버십의 trainer_user_id
- **기준**: `≥ conversion_min` (기본 30%)

### ④ 재등록률 (기간 누적)
- **출처**: `raw_data_pt`
- **정의**: 기간 중 정규 PT 멤버십이 만료된 회원 중 **45일 내 새 정규 PT 멤버십이 시작**된 비율 (ERP /pt/trainer 동일 로직)
- **수식 (per-ending 45일 윈도우, `전환재등록` 컬럼 의존 X)**:
  ```sql
  ending = 정규 만료자 (월별: 멤버십종료일 ∈ 월, 무제한 제외, 환불 제외)
  분모 = COUNT(DISTINCT ending.회원연락처)
  분자 = COUNT(DISTINCT ending.회원연락처) WHERE EXISTS (
    SELECT 1 FROM raw_data_pt pt2
    WHERE pt2.회원연락처 = ending.contact
      AND (pt2.체험정규 IS NULL OR pt2.체험정규='정규')
      AND (pt2.환불여부 IS NULL OR pt2.환불여부 != '환불')
      AND pt2.멤버십시작일 > ending.end_date
      AND pt2.멤버십시작일 <= ending.end_date + INTERVAL '45 days'
  )
  ```
- ⚠️ **왜 `전환재등록='재등록'` 컬럼을 쓰지 않나**: 원천 DB 의 수동/배치 마킹이라 누락이 빈번. 실제 재등록한 회원도 컬럼이 NULL 인 경우 多. ERP 는 컬럼 대신 EXISTS 로 직접 확인 → 우리도 같은 방식. (마킹 누락 사례: 2026-04 강희애·판교 9/13명 재등록을 컬럼 기반으로는 0/13 으로 집계)
- ⚠️ **Per-ending 윈도우 사용 이유**: 기간 전체 윈도우(월초~말+45일 같은 넓은 범위)는 다른 멤버십의 재등록까지 잡혀 오탐. 각 종료의 end_date 기준 45일 내만 검사해야 정확.
- **귀속**: 이전(종료된) 멤버십의 trainer_user_id (재계약을 유도한 주체)
- **기준**: `≥ rereg_min` (기본 40%)
- **후속**: ERP 는 "음수 gap (오버랩) — 이전 멤버십 유효 중 새 결제" 도 재등록으로 인정. 현재 FDE 미포함 (end_date 이후만 잡음).

### ⑤ 세션 완료율 (코호트 — 멤버십 시작월 기준)
- **출처**: `raw_data_pt` ⨯ `raw_data_reservation`
- **정의**: 기간 내 시작된 정규 PT 멤버십 중 **기대 기한 이내** 에 N회 소진한 비율
- **완료 판정**: `raw_data_reservation` 에서 `예약취소='유지'` 카운트 ≥ 총횟수 (= 크레딧 차감 이벤트)
  - 결석·노쇼도 크레딧 차감되면 완료로 집계 → 회원 결석이 트레이너 평가에 유리하게 반영되지 않음
- **소요일**: 멤버십시작일 ~ N번째 유지 예약 수업날짜
- **기대 기한**: `총횟수 × ref_days_per_8 / 8` 일 (8회당 기본 30일)
  - 16회 → 60일, 24회 → 90일, 32회 → 120일
- **수식**:
  ```sql
  candidates = 정규 PT, 총횟수 8~99998, 멤버십시작일 ∈ 기간
  ranked: candidates × reservation 출석유지 → ROW_NUMBER() OVER (PARTITION BY ... ORDER BY 수업날짜, 시작시간)
  완료 멤버십 = ranked WHERE session_no = total_sessions
  rate = COUNT(완료 + 소요일 ≤ 기대기한) / COUNT(완료) × 100
  ```
- **귀속 월**: 멤버십 시작월 (cohort, SaaS 베스트 프랙티스 기반)
- ⚠️ **최근 2개월 코호트는 진행중 멤버십 다수**라 값이 계속 업데이트됨
- **기준**: `≥ completion_min` (기본 70%)

### ⑥ 평균 소진일 (8회 정규화)
- **출처**: ⑤와 동일
- **정의**: 각 완료 멤버십의 `소요일 × 8 / 총횟수` 평균
  - 16회 60일 = 30일/8회 (정상)
  - 16회 90일 = 45일/8회 (지연)
- **기준**: `≤ ref_days_per_8` (기본 30일)
- 16/24/32회 등 다른 크기 멤버십을 한 잣대로 비교

---

## 4. 공통 제외 규칙

| 규칙 | 설명 |
|---|---|
| **무제한권 제외** | `총횟수 ≥ 99999` 멤버십은 모든 지표에서 제외 (임직원권·특수계약) |
| **직원 제외** | `dongha_trainer_excluded` 테이블에 등록된 trainer_name 은 모든 집계에서 제외. UI 에서 추가/삭제 |
| **계약 종료 추정** | 최근 3개월 (`end_month - 2 ~ end_month`) 에 sessions_done 합 = 0 인 trainer_name 제외. **`active_names` 가 빈 set 이면 필터 자체 스킵** (스냅샷 진행중 케이스 방어) |
| **중복 병합** | 같은 이름+같은 지점의 여러 trainer_user_id 는 1행으로 합산 |
| **환불 제외** | `raw_data_pt."환불여부"` 컬럼 사용 (ERP /pt/trainer 동일). `"환불여부" IS NULL OR "환불여부" != '환불'`. `결제상태` 컬럼은 `raw_data_pt` 에 없으므로 쓰지 말 것 (PR #63 사고 사례) |

---

## 5. 재계약 고려 판정

- **fail flags**: 6개 지표 (유효회원·세션·체험전환·재등록·완료율·소진일초과) 중 미달 카운트
- **소진일 초과 판정**: `days_per_8_avg > ref_days_per_8` (별도 threshold 없이 기준 소진일 재사용)
- **고려 임계값**: `fail_threshold` (기본 3, 범위 1~5)
- 미달 지표 수 ≥ threshold → `재계약 고려` 배지 표시
- 그 외에는 배지 없음 (주의/정상 배지 폐기)

---

## 6. 운영 — 스냅샷 갱신

### 자동 (매일 05:00 KST)
`backend/fde/jobs/trainer_snapshot.py::run_snapshot()` 가 `dongha_trainer_monthly` + `dongha_trainer_completion` 모두 UPSERT.

### 수동 (UI)
필터 바 우측 `🔄 스냅샷 재집계` 버튼:
1. `POST /fde-api/dongha/trainers/refresh` (월별, fire-and-forget, 수 분 소요)
2. `POST /fde-api/dongha/trainers/refresh-completion` (완료, **동기**, 결과 즉시 응답)
   - 응답에 `ok`, `stage`, `fetched`, `inserted`, `error`, `traceback` 포함
   - 실패 시 빨간 박스로 UI 에 표시

### CLI
```bash
cd backend/fde
python -m jobs.trainer_snapshot                       # 기본 (2025-01 ~ 어제 월)
python -m jobs.trainer_snapshot --start 2025-01 --end 2026-04
python -m jobs.trainer_snapshot --month 2026-03
```

---

## 7. 기준값 관리

`dongha_trainer_criteria` (singleton id=1):

| 컬럼 | 의미 | 기본 |
|---|---|---|
| `active_members_min` | 유효회원 최소 (월평균) | 15 |
| `sessions_min` | 월 세션 최소 (월평균) | 120 |
| `conversion_min` | 체험전환율 최소 (%) | 30.0 |
| `rereg_min` | 재등록률 최소 (%) | 40.0 |
| `completion_min` | 세션 완료율 최소 (%) | 70.0 |
| `ref_days_per_8` | 기준 소진일 (8회당 일수) | 30 |
| `days_per_8_max` | (사용 안함, deprecated) | 30 |
| `fail_threshold` | 재계약 고려 최소 미달 수 | 3 |

UI: 기준값 패널에서 입력값 변경하면 **실시간 프리뷰** 로 테이블/카드 즉시 재평가 (저장 없이). `저장` 버튼으로 영구화. `ref_days_per_8` 변경 시 overview 재호출 (기대 기한 산식 변경됨).

---

## 8. 파일 가이드

| 파일 | 역할 |
|---|---|
| `backend/fde/routers/dongha_trainers.py` | API 라우터 (overview, monthly, criteria, excluded, sessions, trial-members, rereg-members, active-members, completion-memberships, member-purchases, refresh, refresh-completion, debug/completion, inactive-candidates) |
| `backend/fde/utils/trainer_queries.py` | replica DB 쿼리 함수 (4 + 1 = 5개) |
| `backend/fde/jobs/trainer_snapshot.py` | 일일 스냅샷 잡 |
| `backend/fde/schema.sql` | DDL (dongha_trainer_*) |
| `frontend/packages/erp/src/pages/KimDongha/Trainers/index.tsx` | 메인 페이지 |
| `frontend/packages/erp/src/pages/KimDongha/Trainers/MemberDetailModal.tsx` | 셀 클릭 회원 목록 모달 |
| `frontend/packages/erp/src/pages/KimDongha/Trainers/FormulaAccordion.tsx` | 지표 정의 아코디언 |
| `frontend/packages/erp/src/pages/KimDongha/Trainers/TimeSeriesChart.tsx` | 트레이너별 시계열 차트 |
| `frontend/packages/erp/src/api/fde.ts` | API 클라이언트 (TrainerOverviewRow, CompletionMembershipRow 등) |

---

## 9. 알려진 이슈 / 후속 과제

| 이슈 | 우선순위 | 메모 |
|---|---|---|
| 재등록 음수 gap (오버랩) 미포함 | 중 | ERP 는 이전 멤버십 유효 중 새 정규 결제도 재등록으로 인정. 현 FDE 는 end_date 이후 45일만 봄. 추후 확장 고려 |
| 모달 매칭 동명이인 다지점 | 낮 | 같은 이름·다른 trainer_user_id 가 같은 지점에 있을 때 모달은 둘 다 보여줌. 보통 OK |
| `사용횟수` 기준 vs reservation 카운트 | 검토중 | 현재 reservation 의 `예약취소='유지'` 카운트로 완료 판정. raw_data_pt 의 사용횟수가 일부 멤버십에 미반영되어 reservation 으로 대체 |
| 체험전환율 분모 정의 차이 | 낮 | ERP 는 `전환재등록 IN ('체험전환','미전환')` 만 분모. FDE 는 `체험정규='체험'` 전체. FDE 쪽이 포괄적 (NULL 포함). 큰 차이 없음 |

## 10. ERP `/pt/trainer` 와의 정합성

2026-04-23 기준 5가지 기준 통일:
1. **환불 제외**: `raw_data_pt."환불여부"` 필터 모든 쿼리에 적용
2. **세션 출석 필터 제거**: ERP 처럼 `예약취소='유지'` 만 → 결석도 카운트
3. **세션 프로그램 필터**: `프로그램명='PT'` (기존 `멤버십명 ILIKE '%PT%'` 폐기)
4. **재등록 윈도우**: 30일 → **45일**
5. **재등록 분자 판정**: `전환재등록='재등록'` 컬럼 의존 → **EXISTS 로 새 정규 PT 멤버십 여부 판정** (ERP 방식). 컬럼 마킹 누락으로 인한 오차 해결.

남은 차이 (작음):
- 유효회원: ERP 는 체험+정규, FDE 는 정규만 (트레이너 평가 목적상 의도적 차이)
- 체험전환 분모 정의 (위 표)
- 음수 gap 재등록 (위 표)

검증 시 위 3개 차이 양해. 나머지는 숫자 일치해야 함.
