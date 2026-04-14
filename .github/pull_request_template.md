## 변경 내용
<!-- 무엇을 했는지 1-3줄로 -->

## 작업 전 체크 (필수)
- [ ] `git checkout main && git pull --rebase` 로 최신 main 받고 브랜치 생성
- [ ] 브랜치에 `.github/workflows/` 폴더 존재 (없으면 `git merge origin/main`)
- [ ] 로컬 빌드·타입체크 통과 (`pnpm --filter @butfitvolt/erp build`)

## 보안 체크 (필수)
- [ ] 비밀키·토큰·DB 접속정보 하드코딩 없음
- [ ] `localhost`, `127.0.0.1`, 로컬 포트가 **프로덕션 fallback**으로 들어가지 않음
- [ ] 새 API 엔드포인트는 JWT 인증 붙음 (인증 예외 처리 필요하면 이유 명시)
- [ ] 파괴적 SQL (`DROP`, `TRUNCATE`, 조건 없는 `DELETE/UPDATE`) 없음

## 테스트
<!-- 어떻게 동작 확인했는지 -->

## 스크린샷 / 로그
<!-- UI 변경 있으면 캡처 -->
