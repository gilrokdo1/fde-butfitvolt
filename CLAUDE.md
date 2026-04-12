# CLAUDE.md — 버핏서울 FDE 1기

**한국어 사용 필수**: 응답, 주석, 커밋 메시지 모두 한국어.

## 프로젝트 개요

버핏서울 실제 프로덕션 플랫폼(버핏볼트) 기반 프론트엔드 교육 프로젝트.
8명의 멤버가 하나의 EC2 + GitHub 레포를 공유하며, 각자 자기 이름 메뉴 아래 기능을 구현한다.

## 핵심 규칙

### 프론트엔드만 작업한다
- `backend/` 폴더는 **절대 수정하지 않는다**
- 프론트엔드: `frontend/packages/erp/src/pages/FDE/내이름/` 에서 작업
- 공유 파일(`App.tsx`, `menuConfig.ts` 등)은 최소한만 수정 (한 줄 추가 수준)

### API는 기존 것을 사용한다
- 사용 가능한 API 목록: `버핏서울_FDE_1기/openapi.json` 참조
- 새 API가 필요하면 직접 만들지 말고, 기획서를 작성해서 운영팀에 요청
- API 완성 전에는 목업 데이터로 프론트엔드를 먼저 완성

### 로컬 개발 환경
```bash
cd frontend && pnpm install && pnpm dev:erp   # http://localhost:5173
```
- `.env.development` 에 `VITE_API_URL=https://butfitvolt.click` 설정
- 백엔드 로컬 실행 불필요 (프로덕션 API 사용)

### Git 작업
- 커밋 전 반드시 `git pull --rebase`
- 커밋 메시지: `feat: 김동하 — 기능 설명` (이름 포함)
- 배포: `./deploy.sh erp` (프론트엔드만)
- 배포 락 발생 시 1분 대기 후 재시도 (lock 파일 직접 삭제 금지)

## 기술 스택

- React 19 + TypeScript (strict) + Vite + React Query v5 + CSS Modules
- 스타일: CSS Modules (`.module.css`), `import s from './X.module.css'`, clsx
- 폰트: Pretendard, 이모지: Tossface
- Primary 컬러: #5B5FC7

## 기획할 때

**brainstorming 스킬을 적극 활용한다.**
"OO 기능을 만들자"보다 **"OO 기능을 기획하자"**로 시작하면
요구사항 정리 → 디자인 방향 → 데이터 구조 → 구현 계획까지 체계적으로 진행된다.

## 참고 문서

| 문서 | 내용 |
|------|------|
| `README.md` | 프로젝트 개요, 멤버, 세팅, 용어 사전 |
| `ARCHITECTURE.md` | 시스템 아키텍처, 메뉴 구조 |
| `DEVELOPMENT-GUIDE.md` | 개발 가이드, 디자인 시스템, AI 스킬 |
| `DATA-GUIDE.md` | 데이터 구조, DB 테이블, 스냅샷 |
| `openapi.json` | 백엔드 API 전체 스펙 |

## 디자인 원칙

- 데이터가 주인공, 모바일 퍼스트, 클린 미니멀
- 안티패턴: AI 슬롭(Inter+보라 그라데이션), 느린 애니메이션, 카드 남발
- 디자인 시스템: https://erp.butfitvolt.click/butfitseoul/design-system
