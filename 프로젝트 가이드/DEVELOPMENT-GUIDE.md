# 개발 가이드

프론트엔드와 백엔드 코드 구조, 컨벤션, 그리고 **내 기능을 추가하는 방법**을 다룹니다.

---

## 프론트엔드

### 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 19 | UI 프레임워크 |
| TypeScript | strict mode | 타입 안전성 |
| Vite | 7.x | 번들러 + 개발 서버 |
| React Query | v5 (@tanstack/react-query) | 서버 상태 관리 + 캐싱 |
| React Router | v7 | 클라이언트 라우팅 |
| axios | 1.14.0 | HTTP 클라이언트 |
| CSS Modules | (built-in) | 스코프드 스타일링 |
| clsx | - | 조건부 클래스명 |

### 앱별 src/ 구조

```
src/
├── main.tsx              # Vite 진입점 (ReactDOM.createRoot)
├── App.tsx               # 라우터 + QueryClientProvider
├── index.css             # 글로벌 스타일 (Tossface 폰트 등)
│
├── api/
│   └── client.ts         # axios 인스턴스 + API 함수들
│
├── components/
│   ├── Layout.tsx        # 사이드바 + 헤더 + 콘텐츠 영역
│   ├── ProtectedRoute.tsx # 인증 가드
│   └── [기능별].tsx       # UI 컴포넌트
│
├── pages/
│   ├── Login.tsx         # 로그인 페이지
│   ├── Home.tsx          # 대시보드
│   └── FDE/              # ← FDE 멤버별 페이지
│       ├── KimDongha/
│       ├── KimSoyeon/
│       └── ...
│
├── contexts/
│   └── AuthContext.tsx    # 인증 상태 (JWT 토큰, 사용자 정보)
│
├── services/
│   └── authService.ts    # 로그인/로그아웃/토큰 갱신
│
├── hooks/                # 커스텀 훅
├── types/                # TypeScript 타입 정의
├── constants/            # 상수, 필터 메타데이터
└── config/               # 메뉴 설정
```

### 디자인 가이드

> 디자인 시스템 라이브 페이지: https://fde.butfitvolt.click/fde/design-system

#### 브랜드 성격

- **3단어**: 스마트 · 빠른 · 직관적
- **톤**: 군더더기 없는 전문 도구. 꾸밈보다 명확함. **데이터가 주인공**
- **절대 아닌 것**: 유치한 일러스트, 과도한 그라데이션, 느린 애니메이션

#### 디자인 토큰

```
Primary : #5B5FC7 (인디고)  |  Hover: #4B4FB7  |  Light: #6366F1
Font    : Pretendard Variable (400/500/600/700)
Emoji   : Tossface (font-family: Tossface, sans-serif)
Radius  : 4px (sm) / 6px (md) / 8px (lg) / 12px (xl)
Spacing : 4px 기반 (4, 8, 12, 16, 20, 24, 32, 40, 48)
Shadow  : 3단계 (sm / md / lg)
Status  : 성공 #10b981 | 오류 #dc2626 | 경고 #f59e0b
```

#### 설계 원칙

1. **데이터가 주인공** — 장식이 아니라 숫자와 정보가 시각적 중심
2. **속도가 곧 신뢰** — 인터랙션은 즉각적, 로딩은 스켈레톤으로 대체
3. **깔끔함이 전문성** — 여백 아끼지 않기, 토스처럼 복잡한 것을 단순하게
4. **일관성이 효율** — 5개 앱 전체에서 동일한 토큰/패턴/컴포넌트 공유
5. **실수를 방지** — 금액/날짜/상태는 컬러 코딩, 위험 액션은 확인 단계
6. **모바일 퍼스트** — 모든 UI는 모바일에서 먼저 동작해야 함

#### 모바일 퍼스트

| 항목 | 규칙 |
|------|------|
| 레이아웃 | 단일 컬럼 우선, 멀티 컬럼은 768px 이상 |
| 터치 타겟 | 최소 44x44px, 행 높이 48px+, 버튼 간격 8px+ |
| 본문 폰트 | 최소 14px (모바일 13px 미만 금지) |
| 숫자/데이터 | 최소 18px |
| 테이블 | 모바일에서는 리스트 행 UI 선호, 필수 컬럼만 표시 |
| 입력 필드 | 높이 최소 44px, 셀렉트 > 텍스트 입력 |
| 브레이크포인트 | 480px (모바일) / 768px (태블릿) / 1200px (데스크톱) |

#### 안티패턴 (절대 금지)

- Inter + 보라 그라데이션 조합 (AI 슬롭)
- 카드 상단 컬러 스트립 + 중앙정렬 히어로 숫자
- `border-radius: 9999px` 남발
- 카드마다 큰 그림자 (시각적 소음)
- 300ms 이상 느린 페이드인 애니메이션
- 데이터 테이블에 카드 UI 강제 적용 (밀도 손실)
- hover 전용 인터랙션 (모바일에서 동작 불가)
- **`position: fixed` + `top:0/left:0` + `100vw/100vh` 로 페이지를 전체 화면 덮기** — 상단 헤더/네비/서브네비를 가려서 다른 페이지로 이동할 수 없게 됨. iframe·풀스크린 대시보드도 예외 없이 `Layout` 콘텐츠 영역(`<Outlet />` 안쪽) 안에서 그려야 함

### 페이지 영역 규칙 (중요)

모든 라우트는 `Layout`의 `<Outlet />` 안에서 렌더링된다. 즉 페이지 컴포넌트는 **헤더(56px) + 서브네비 + content padding 안쪽**만 책임진다.

- ❌ `position: fixed; inset: 0; z-index: 100` 같은 풀스크린 오버레이로 페이지 본문을 깔면 헤더/네비가 사라져 사용자가 갇힌다 (실제 발생 사례: `LandlordSettlement.module.css`의 iframe).
- ✅ iframe·캔버스·임베드 대시보드는 `width: 100%; height: calc(100vh - 160px)` 정도로 콘텐츠 영역을 채우고, 모바일은 `calc(100vh - 120px)` 사용.
- ✅ 진짜 풀스크린이 필요하면 모달/드로어처럼 닫기 버튼을 함께 제공하거나 별도 라우트 + Layout 우회 구조를 PR로 논의할 것.

### CSS 스타일링 규칙

#### CSS Modules 사용

```tsx
import s from './MyComponent.module.css';

<div className={s.container}>
  <h1 className={s.title}>제목</h1>
</div>
```

#### Vite 설정: camelCaseOnly

```css
/* MyComponent.module.css */
.my-class { ... }       /* CSS: kebab-case */
.active-state { ... }
```

```tsx
s.myClass       // JS: camelCase 로 참조
s.activeState
```

#### 조건부 클래스

```tsx
import clsx from 'clsx';

<div className={clsx(s.card, isActive && s.active, size === 'lg' && s.large)}>
```

#### 기타 규칙

- `!important` 사용 금지 (라이브러리 인라인 스타일 override 시에만 허용)
- 이모지는 반드시 토스페이스(Tossface): `font-family: Tossface, sans-serif`
- 글로벌 클래스 참조: 문자열 `className="filter-bar"` 또는 `:global()` 사용

### 데이터 페칭 패턴

#### React Query 기본

```tsx
import { useQuery } from '@tanstack/react-query';
import { fetchActiveMembers } from '../api/client';

function ActiveMemberPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['activeMembers', { place, month }],
    queryFn: () => fetchActiveMembers({ place, month }),
  });

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <Table data={data} />;
}
```

#### API 클라이언트 패턴

```tsx
// api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8002',
});

// JWT 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// API 함수
export const fetchActiveMembers = async (params) => {
  const { data } = await api.post('/api/ground/active-members', params);
  return data;
};
```

### 인증 패턴

```tsx
// contexts/AuthContext.tsx
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const login = async (username, password) => {
    const { data } = await api.post('/api/auth/login', {
      username, password, app_type: 'erp'
    });
    localStorage.setItem('token', data.access_token);
    setToken(data.access_token);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **단일 스크롤** | 페이지에 메인 스크롤 1개만. 테이블은 가로 스크롤만, 모달만 별도 스크롤 |
| **테이블 고정** | `table-layout: fixed` — 뷰 모드 전환 시 컬럼 너비 점프 방지 |
| **지점 필터** | '전체' 선택 시 오피스 관련 지점은 '오피스'로 합산 |

---

## 백엔드 (참고용)

> **FDE 멤버는 백엔드 코드를 직접 수정하지 않습니다.**
> 새로운 API가 필요하면 기획서를 작성해서 운영팀에 요청하세요.

아래는 백엔드 구조를 이해하기 위한 참고 자료입니다.

### 기술 스택

FastAPI (Python) + PostgreSQL 2개 (레플리카: 읽기 전용 원본, 버핏볼트: 앱 전용 데이터)

### API 호출 방식

프론트엔드에서 API를 호출할 때 알아야 할 것:

```tsx
// 이미 만들어진 API 사용
const { data } = await api.post('/api/ground/active-members', {
  place: '역삼',
  month: '2026-04'
});

// 인증은 자동 (axios 인터셉터가 JWT 토큰 첨부)
```

### 주요 API 라우터

| 라우터 | 엔드포인트 | 핵심 기능 |
|--------|-----------|----------|
| `auth.py` | `/api/auth/*` | 로그인, 토큰 발급/갱신 |
| `ground.py` | `/api/ground/*` | 유효회원, 체크인, VOC |
| `dashboard.py` | `/api/dashboard/*` | 대시보드 KPI 통계 |
| `finance.py` | `/api/finance/*` | 손익, 캐시플로우 |
| `pt.py` | `/api/pt/*` | PT 멤버십, 예약, 정산 |
| `revenue.py` | `/api/revenue/*` | 현금/발생주의 매출 |
| `people.py` | `/api/employee/*` | 직원 관리 |

### 에이전트가 API를 찾는 방법

Claude Code 에이전트는 다음 순서로 API를 파악합니다:

1. **로컬 OpenAPI 스펙 참조**: `버핏서울_FDE_1기/openapi.json` 을 읽어서 전체 API 목록, 파라미터, 응답 형태를 파악
2. **기존 프론트엔드 코드 참조**: `api/client.ts` 에서 이미 호출하고 있는 API 함수들을 확인
3. **없으면 운영팀에 요청**: 아래 형식으로 기획

```
제목: OO 데이터 조회 API
목적: 어떤 페이지에서, 왜 필요한지
요청/응답 형태: { ... }
참고 데이터: raw_data_activeuser, raw_data_mbs 등 (DATA-GUIDE.md 참고)
```

---

## 내 기능 추가하기 (FDE 실습)

FDE 멤버가 자기 이름 메뉴 아래에 새 기능을 추가하는 전체 과정입니다.

### 예시: 김동하가 "회원 검색" 페이지를 추가하는 경우

#### Step 1. 페이지 생성

```tsx
// frontend/packages/erp/src/pages/FDE/KimDongha/MemberSearch.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import s from './MemberSearch.module.css';

export default function MemberSearch() {
  const [place, setPlace] = useState('전체');
  const [month, setMonth] = useState('2026-04');

  // 기존 공용 API 사용
  const { data, isLoading } = useQuery({
    queryKey: ['active-members', place, month],
    queryFn: () => api.post('/api/ground/active-members', { place, month }).then(r => r.data),
  });

  return (
    <div className={s.container}>
      <h1>유효회원 조회</h1>
      <select value={place} onChange={e => setPlace(e.target.value)}>
        <option value="전체">전체</option>
        <option value="역삼">역삼</option>
        <option value="삼성">삼성</option>
      </select>
      {isLoading && <p>로딩 중...</p>}
      {data && (
        <table>
          <thead>
            <tr><th>지점</th><th>유효회원 수</th></tr>
          </thead>
          <tbody>
            {data.data?.map((row, i) => (
              <tr key={i}>
                <td>{row.place}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

#### Step 2. 라우터에 페이지 등록

```tsx
// App.tsx 또는 라우터 설정 파일에 추가
import MemberSearch from './pages/FDE/KimDongha/MemberSearch';

<Route path="/fde/kim-dongha/member-search" element={<MemberSearch />} />
```

#### Step 3. 메뉴 설정에 추가

```ts
// config/menuConfig.ts (FDE 섹션)
{
  name: '김동하',
  icon: 'https://avatars.slack-edge.com/...',  // 슬랙 프로필 사진
  children: [
    { name: '회원 검색', path: '/fde/kim-dongha/member-search' },
  ],
}
```

#### Step 4. 사용 가능한 API 확인

기존 API 목록은 **로컬 OpenAPI 스펙 파일**에서 확인합니다:

```
버핏서울_FDE_1기/openapi.json    ← 전체 API 스펙 (엔드포인트, 파라미터, 응답 형태)
```

> **Claude Code 에이전트 팁**: "이 프로젝트에 어떤 API가 있어?" 라고 물으면
> 에이전트가 `openapi.json`을 읽고 사용 가능한 API 목록을 정리해줍니다.

> Swagger UI(웹 문서)는 보안상 외부 공개하지 않습니다.
> 원하는 API가 없으면 운영팀에 요청하세요.
> API가 만들어지기 전에는 **목업 데이터**로 프론트를 먼저 완성할 수 있습니다:
> ```tsx
> // 임시 목업 (API 완성 전)
> const mockData = {
>   data: [
>     { place: '역삼', count: 1234 },
>     { place: '삼성', count: 987 },
>   ]
> };
> ```

#### Step 5. 빌드 → 커밋 → 배포

```bash
# 프론트엔드 빌드 확인
cd frontend && pnpm build:erp

# Git
git pull --rebase
git add -A
git commit -m "feat: 김동하 — 회원 검색 페이지 추가"
git push

# 배포 (프론트엔드만)
./deploy.sh erp
```

---

## 주의사항

### 충돌 방지

- **자기 디렉토리에서만 작업**: `pages/FDE/내이름/` 폴더 안에서만 파일 생성/수정
- **공유 파일 수정 최소화**: `App.tsx`, `menuConfig.ts` 등은 한 줄만 추가
- **백엔드 코드 수정 금지**: `backend/` 폴더는 건드리지 않음
- 커밋 전 반드시 `git pull --rebase`

### 배포

- 배포 전 반드시 `pnpm build:erp` 로 빌드 확인
- 배포 락 발생 시 1분 대기 후 재시도 (lock 파일 직접 삭제 금지)
- 배포 후 `git status` 로 미커밋 파일 확인

### 보안

- `.env` 파일, 비밀번호, API 키 등 민감 정보 커밋 금지
- SQL 쿼리에 파라미터 바인딩 필수 (`%s` 사용, f-string 금지)
- `axios@1.14.1`, `axios@0.30.4` 버전 사용 금지 (악성코드 포함)

---

## AI 에이전트 스킬 (Claude Code)

Claude Code에는 작업별로 특화된 **스킬(플러그인)**이 설치되어 있습니다.
슬래시 명령어(`/스킬명`)로 호출하거나, 에이전트가 상황에 맞게 자동으로 사용합니다.

### 기획/설계 — superpowers 시리즈

| 스킬 | 호출 | 설명 |
|------|------|------|
| **brainstorming** ⭐ | 자동 | **기획할 때 가장 추천.** 기능을 만들기 전에 "뭘 만들지"를 정리해줌. 요구사항 탐색, 디자인 방향, 대안 비교까지 |
| writing-plans | 자동 | 브레인스토밍 후 구체적인 구현 계획서 작성. 단계별 작업 분해 |
| executing-plans | 자동 | 작성된 계획을 실행. 체크포인트별 리뷰 |
| systematic-debugging | 자동 | 버그 발생 시 체계적 원인 추적 (로그 → 가설 → 검증) |
| verification-before-completion | 자동 | 작업 완료 선언 전 빌드/테스트 자동 검증 |
| dispatching-parallel-agents | 자동 | 독립적인 작업 2개 이상일 때 병렬 실행 |

> **기획이 먼저다**: "회원 검색 페이지 만들어줘"보다 **"회원 검색 기능을 기획하자"**라고 하면
> brainstorming 스킬이 자동 발동해서 어떤 필터가 필요한지, UI는 어떤 형태가 좋은지,
> 데이터는 어떤 테이블에서 가져올지를 같이 정리한 뒤 코드를 짭니다.

### 개발 워크플로우

| 스킬 | 호출 | 설명 |
|------|------|------|
| **plan** | `/plan` | 비자명 작업의 계획 수립. 연구 → 옵션 비교 → 승인 후 실행 |
| **commit** | `/commit` | Git 커밋 + 푸시. 커밋 메시지 자동 생성 |
| simplify | `/simplify` | 변경된 코드의 품질/중복/효율 리뷰 후 개선 |
| snapshot | `/snapshot` | DB 스냅샷 함수(raw_data_*) 로컬 SQL과 비교 후 업데이트 |

### UI/UX 디자인

| 스킬 | 호출 | 설명 |
|------|------|------|
| **frontend-design** | 자동 | 프로덕션 수준의 UI 컴포넌트/페이지 생성 |
| make-interfaces-feel-better | 자동 | 정렬, 그림자, 호버, 타이포 등 디테일 폴리싱 |
| polish | `/polish` | 배포 전 간격/일관성 최종 패스 |
| critique | `/critique` | UX 관점 정량 평가 (점수 + 개선안) |
| adapt | 자동 | 반응형 대응 (모바일/태블릿 레이아웃) |

### 문서/파일 생성

| 스킬 | 호출 | 설명 |
|------|------|------|
| pdf | 자동 | PDF 생성/읽기/편집 |
| docx | 자동 | Word 문서 생성/편집 |
| pptx | 자동 | 파워포인트 생성/편집 |
| xlsx | 자동 | 엑셀 생성/편집 |

### 라이브러리 문서 조회

| 스킬 | 호출 | 설명 |
|------|------|------|
| **context7** | 자동 | React, FastAPI, Vite 등 라이브러리 최신 공식 문서 자동 조회. "React Query 사용법" 같은 질문에 학습 데이터가 아닌 **현재 공식 문서**를 참조 |

### 추천 워크플로우

```
1. 기획   → "OO 기능을 기획하자" (brainstorming 자동 발동)
2. 계획   → brainstorming 결과를 바탕으로 구현 계획 수립 (writing-plans)
3. 구현   → 계획대로 코드 작성 (executing-plans)
4. 폴리싱 → UI 다듬기 (make-interfaces-feel-better, polish)
5. 검증   → 빌드 + 동작 확인 (verification-before-completion)
6. 배포   → /commit → deploy.sh
```
