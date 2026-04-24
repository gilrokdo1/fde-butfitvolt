# 루케테80 환불 산정 대시보드

가산점(또는 신도림) 루케테80 회원 전원이 동시 환불 요청 시 **총 환불 금액을 사전 산정**하는 Streamlit 대시보드.

> 내부 실무자용 · 근거 약관 제7조(그룹) · 제13조(개인) · 제7조.4(카드수수료)

---

## 실행

```bash
pip install -r requirements.txt
cp .env.example .env   # 편집기로 DB_USER/DB_PASSWORD 수정
streamlit run dashboard.py --server.port 8503
```

접속: http://localhost:8503

---

## EC2 배포 (최초 1회 부트스트랩)

`./deploy.sh lukete`를 처음 실행하면 Nginx 프록시 미설정으로 실패합니다. 1회만 EC2에서 부트스트랩 스크립트 실행:

```bash
# 1. 로컬에서 .env 를 EC2로 복사 (최초 1회)
scp -i BUTFITSEOUL_FDE1.pem backend/lukete/.env \
    ec2-user@13.209.66.148:~/fde1/lukete/.env

# 2. EC2 SSH 접속 후 부트스트랩
ssh -i BUTFITSEOUL_FDE1.pem ec2-user@13.209.66.148
bash ~/fde1/lukete/scripts/ec2_first_setup.sh
```

부트스트랩은 **멱등** — 이미 설정된 항목은 스킵하므로 재실행 안전.

완료 후 접속:
- https://fde.butfitvolt.click/lukete/ (Streamlit 단독)
- https://fde.butfitvolt.click/fde/kim-dongha/lukete-refund (FDE iframe)

## 이후 배포

```bash
./deploy.sh lukete
```

또는 `backend/lukete/`를 `main`에 머지하면 GitHub Actions가 자동 배포.

---

## 구성

### 상단
- 메타데이터 헤더 · 필터(지점/참여/과금/카드수수료)
- KPI 3카드 · 환불 시나리오 매트릭스(2×2 + 차이 행)

### 탭
- **전체 회원** — 계산 근거 패널 + 20컬럼 회원 테이블 + CSV
- **요약** — 상품 유형별 · 지점별 집계 + FAQ
- **약관 참조** — 약관 전문

---

## 환불 계산 규칙

### 개인 · 회차권 (제13조)
```
위약금            = 구매가 × 10%
환불(약관 일반가) = 구매가 − 출석 × 88,000
환불(상품 정가)   = 구매가 − 출석 × (구매가 ÷ 총회차)
환불(위약금 공제) = 위 값 − 위약금
```

### 그룹 · 기간권 (제7조)
```
위약금 = 구매가 × 10%
공제   = max(구매가 ÷ 30 × 경과일수, (경과일수//7) × 2 × 33,000)
환불   = 구매가 − 공제
```
기간권은 회차 개념 없어 "약관 = 정가" 동일값.

### 카드수수료 (제7조.4, 토글)
ON 시 환불 4값에 `× 0.965` 적용.

### 공통
- 음수 결과는 **0원** clamp + `환불0원` 뱃지
- 이미 환불된 거래 · 만료 회원 제외 · 미시작 회원 포함

---

## 상태 뱃지

| 뱃지 | 조건 |
|---|---|
| `미시작` | 시작일 > 오늘 |
| `사용중` | 시작일 ≤ 오늘 ≤ 종료일 |
| `만료임박` | 사용중 + 종료까지 ≤ 30일 |
| `환불0원` | 계산된 환불액 ≤ 0 (덮어씀) |

---

## 파일 구조

```
lukete_refund_dashboard/
├── dashboard.py            # Streamlit 메인
├── data_loader.py          # DB + 마스킹 + 캐시
├── refund_calculator.py    # 약관 기반 pure function
├── queries/                # SQL (개인/그룹)
├── assets/terms.md         # 약관 전문
├── tests/                  # pytest 12개
├── .env / .env.example     # DB 접속 정보
├── requirements.txt
└── .streamlit/config.toml  # 포트 8503
```

---

## 테스트

```bash
pytest tests/ -v
```

---

## 지점 확장

`data_loader.py` 의 `PLACE_ID_MAP` 에 추가만 하면 자동으로 쿼리에 포함됩니다.

```python
PLACE_ID_MAP = {"가산": 20, "신도림": 16}
```

---

## 주의

- 본 수치는 **사전 시뮬레이션용** 이며 실제 환불 처리값은 합의·약관 해석에 따라 달라집니다.
- 기간권 실제 사용 세션은 **참고용** 이며 계산엔 약관 "주 2회 간주"를 사용.
- 카드수수료 3.5% 는 약관 명시 수치로 실결제 PG 수수료와 다를 수 있습니다.
