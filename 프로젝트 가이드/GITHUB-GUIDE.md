# GitHub 협업 가이드 — 처음 쓰는 사람을 위해

> GitHub을 한 번도 써본 적 없어도 괜찮습니다.
> 이 문서를 순서대로 따라오면 레포에 코드를 올릴 수 있습니다.

---

## 목차

1. [Git · GitHub · GitHub Desktop 설치](#1-git--github--github-desktop-설치)
2. [GitHub 회원가입 + 이메일 설정](#2-github-회원가입--이메일-설정)
3. [레포 초대 수락](#3-레포-초대-수락)
4. [레포 Clone (내 컴퓨터로 복사)](#4-레포-clone-내-컴퓨터로-복사)
5. [브랜치 만들기 — 내 작업 공간 분리](#5-브랜치-만들기--내-작업-공간-분리)
6. [작업 → 저장 → 커밋 → 푸시](#6-작업--저장--커밋--푸시)
7. [PR(Pull Request) 올리기 — 팀에 내 코드 공유](#7-pull-request-올리기--팀에-내-코드-공유)
8. [충돌(Conflict) 났을 때](#8-충돌conflict-났을-때)
9. [자주 쓰는 명령어 모음](#9-자주-쓰는-명령어-모음)

---

## 1. Git · GitHub · GitHub Desktop 설치

### Git이란?

코드의 변경 이력을 추적하는 도구입니다. "언제, 누가, 뭘 바꿨는지" 기록합니다.
GitHub은 그 이력을 인터넷에 올려두는 저장소입니다.

### Mac

터미널을 열고 아래 명령어를 붙여넣으세요.

```bash
# Homebrew가 없으면 먼저 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Git 설치
brew install git

# Node.js + pnpm 설치 (프론트엔드 개발용)
brew install node
npm install -g pnpm
```

> 터미널: Spotlight(`Cmd+Space`) → "터미널" 검색

### Windows

1. https://git-scm.com/download/win 에서 Git 설치 파일 다운로드 후 실행
   - 설치 중 옵션은 전부 기본값으로 Next 클릭
2. https://nodejs.org 에서 LTS 버전 Node.js 설치
3. 설치 후 **Git Bash**를 열고 `npm install -g pnpm` 실행

> 이후 모든 명령어는 Mac은 **터미널**, Windows는 **Git Bash**에서 실행합니다.

### 설치 확인

```bash
git --version    # git version 2.xx.x 나오면 성공
node --version   # v20.xx.x 이상이면 성공
pnpm --version   # 9.x.x 이상이면 성공
```

---

## 2. GitHub 회원가입 + 이메일 설정

### 회원가입

1. https://github.com/signup 접속
2. 이메일 입력 → 비밀번호 → 사용자명(username) 설정
   - username은 나중에 레포에서 내 활동을 식별하는 데 쓰입니다
   - 예: `kim-dongha`, `soyeon-kim` 등 알아보기 쉬운 걸로

3. 가입 완료 후 이메일 인증까지 마치기

### 랭킹 집계를 위한 Git 설정 (필수!)

GitHub이 내 커밋을 내 계정과 연결하려면, **터미널에서** 아래를 실행해야 합니다.

```bash
git config --global user.email "내-GitHub-이메일"
git config --global user.name "내-GitHub-username"
```

예시:
```bash
git config --global user.email "dongha@butfitseoul.com"
git config --global user.name "kim-dongha"
```

> 이메일 확인: https://github.com/settings/emails (Primary email)
> username 확인: https://github.com/settings/profile (Username 항목)

설정 확인:
```bash
git config --global user.email   # 내 이메일이 출력되면 성공
git config --global user.name    # 내 username이 출력되면 성공
```

> ⚠️ 이 설정을 안 하면 랭킹 시스템에서 내 GitHub 활동이 `?`로 표시되어 점수에 반영되지 않습니다.

---

## 3. 레포 초대 수락

관리자(도길록)가 GitHub에서 Collaborator로 초대합니다.

1. GitHub 가입 이메일로 초대 메일이 옵니다 → **View invitation** 클릭
2. 또는 https://github.com/gilrokdo1/fde-butfitvolt/invitations 직접 접속
3. **Accept invitation** 클릭

수락하면 레포에 코드를 push(올리기)할 수 있게 됩니다.

---

## 4. 레포 Clone (내 컴퓨터로 복사)

레포를 내 컴퓨터로 다운로드하는 과정입니다.

```bash
# 원하는 위치로 이동 (예: Documents 폴더)
cd ~/Documents

# 레포 복사
git clone https://github.com/gilrokdo1/fde-butfitvolt.git

# 폴더로 이동
cd fde-butfitvolt

# 프론트엔드 의존성 설치
cd frontend
pnpm install
```

설치가 완료되면 개발 서버를 실행해봅니다:

```bash
pnpm dev:erp
```

브라우저에서 http://localhost:5173 을 열면 FDE 앱이 나타납니다.

> 환경 변수: `frontend/packages/erp/.env.development` 파일이 이미 레포에 있습니다.
> 로컬 백엔드 없이 바로 테스트하려면 파일 안의 `VITE_API_URL`을 아래로 변경하세요:
> ```
> VITE_API_URL=https://fde.butfitvolt.click
> ```

---

## 5. 브랜치 만들기 — 내 작업 공간 분리

브랜치는 "main 코드를 건드리지 않고 내가 실험할 수 있는 복사본"입니다.
작업은 **반드시 브랜치를 만들어서** 합니다.

```bash
# 항상 최신 main으로 시작
git checkout main
git pull --rebase

# 내 브랜치 만들기 (이름은 작업 내용을 알 수 있게)
git checkout -b feat/김동하-출결-대시보드
```

브랜치 이름 규칙:
```
feat/이름-기능설명     # 새 기능
fix/이름-버그내용      # 버그 수정
```

현재 어떤 브랜치에 있는지 확인:
```bash
git branch    # * 표시된 게 현재 브랜치
```

---

## 6. 작업 → 저장 → 커밋 → 푸시

### 코드 작성

VS Code 등 편집기에서 `frontend/packages/erp/src/pages/FDE/내이름/` 폴더 안에서 작업합니다.

### 변경사항 확인

```bash
git status       # 어떤 파일이 변경됐는지 확인
git diff         # 실제로 무엇이 바뀌었는지 확인
```

### 커밋 (변경 이력 저장)

```bash
# 변경된 파일 스테이징 (저장 준비)
git add .

# 커밋 (이력에 기록)
git commit -m "feat: 김동하 — 수업 출결 대시보드 추가"
```

커밋 메시지 규칙:
```
feat: 이름 — 기능 설명    # 새 기능 추가
fix: 이름 — 버그 수정 내용  # 버그 수정
```

> ⚠️ `git add .` 전에 `.env` 파일, 비밀번호 등 민감한 정보가 없는지 꼭 확인하세요.

### 푸시 (GitHub에 올리기)

```bash
git push origin feat/김동하-출결-대시보드
```

처음 push할 때 GitHub 로그인 팝업이 뜰 수 있습니다. GitHub 계정으로 로그인하면 됩니다.

---

## 7. Pull Request 올리기 — 팀에 내 코드 공유

PR은 "내 브랜치의 코드를 main에 합쳐달라"는 요청입니다.

### PR 생성

1. https://github.com/gilrokdo1/fde-butfitvolt 접속
2. 상단에 노란 배너 **"Compare & pull request"** 버튼 클릭
   - (또는 **Pull requests** 탭 → **New pull request**)
3. 아래 내용 입력:

**제목 (Title)**:
```
feat: 김동하 — 수업 출결 대시보드
```

**본문 (Description)**:
```
## 무엇을 만들었나요?
- 팀버핏 수업별 출결 현황을 한눈에 볼 수 있는 대시보드

## 어떻게 확인하나요?
- /fde/kim-dongha/attendance 접속
- 지점/날짜 필터로 조회

## 스크린샷 (있으면 첨부)
```

4. **Create pull request** 클릭

### 머지 (main에 합치기)

관리자가 확인 후 머지합니다. 머지되면 배포가 가능합니다.

### 머지 후 정리

PR이 머지되면 내 브랜치는 삭제하고 main으로 돌아옵니다:

```bash
git checkout main
git pull --rebase
git branch -d feat/김동하-출결-대시보드   # 로컬 브랜치 삭제
```

### 배포

머지된 코드를 실제 서버에 반영합니다:

```bash
# 프론트엔드만 변경한 경우
./deploy.sh erp

# FDE 백엔드도 변경한 경우
./deploy.sh fde-backend
```

> 배포 락 발생 시 1분 대기 후 재시도. lock 파일 직접 삭제 금지.

---

## 8. 충돌(Conflict) 났을 때

같은 파일을 두 사람이 동시에 수정하면 충돌이 납니다.
겁먹지 말고 아래 순서대로 해결하면 됩니다.

### 증상

`git pull --rebase` 또는 `git merge` 후 아래 메시지:

```
CONFLICT (content): Merge conflict in src/App.tsx
```

### 해결 방법

1. VS Code에서 충돌 파일 열기
2. 이런 부분이 보입니다:

```
<<<<<<< HEAD (내 변경사항)
const title = "김동하 버전";
=======
const title = "김소연 버전";
>>>>>>> main
```

3. 둘 중 하나를 남기거나, 두 내용을 합쳐서 최종본으로 만들기:

```
const title = "최종 버전";
```

4. `<<<<<<<`, `=======`, `>>>>>>>` 표시 줄을 모두 삭제
5. 저장 후:

```bash
git add .
git rebase --continue   # rebase 중이었다면
# 또는
git commit              # merge 중이었다면
```

### 충돌 예방법

- 작업 전 항상 `git pull --rebase`
- 가능하면 **자기 폴더(`pages/FDE/내이름/`)에서만** 작업
- 공유 파일(`App.tsx`, `menuConfig.ts`)은 최소한만 수정

---

## 9. 자주 쓰는 명령어 모음

```bash
# 현재 상태 확인
git status                          # 변경된 파일 목록
git log --oneline -10               # 최근 10개 커밋 이력
git branch                          # 브랜치 목록 (현재 브랜치에 *)

# 동기화
git pull --rebase                   # 최신 main 가져오기

# 브랜치
git checkout main                   # main으로 이동
git checkout -b feat/이름-기능      # 새 브랜치 만들고 이동
git checkout feat/이름-기능         # 기존 브랜치로 이동

# 저장
git add .                           # 변경 파일 전부 스테이징
git add src/pages/FDE/내이름/       # 특정 폴더만 스테이징
git commit -m "feat: 이름 — 설명"   # 커밋

# GitHub에 올리기
git push origin 브랜치이름          # 푸시

# 실수 되돌리기
git restore 파일경로                 # 아직 커밋 안 한 변경사항 되돌리기
git reset HEAD~1                    # 마지막 커밋 취소 (코드는 유지)
```

---

## 도움이 필요하면

1. 슬랙 채널에 물어보기 — 팀원들이 도와줍니다
2. 에러 메시지를 복사해서 Claude Code에 붙여넣기 (터미널 → Claude Code)
3. git 관련 에러는 대부분 구글 검색으로 해결됩니다

> 처음엔 명령어가 낯설게 느껴지지만, 5번 쓰면 손에 익습니다.
> 실수해도 괜찮습니다 — git은 되돌리는 게 가능하도록 설계되어 있습니다.
