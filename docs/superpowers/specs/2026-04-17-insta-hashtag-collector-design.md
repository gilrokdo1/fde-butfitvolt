# 인스타 해시태그 수집기 (DoGilrok 페이지)

작성: 2026-04-17 / 담당: 도길록 / 사용자: 김소연 (테스트)

## 목적
김소연 멤버가 노가다로 모으던 인스타 해시태그 게시물(`#팀버핏`, `#TEAMBUTFIT` 등)을 자동으로 수집·누적·검색할 수 있는 페이지. 글라이드/팬텀버스터가 하던 것을 자체 구현.

## 범위
- 등록한 해시태그를 매일 새벽 4시 자동 수집(cron).
- 페이지에서 즉석 수집(임의 해시태그)도 가능.
- 수집된 게시물은 FDE DB에 누적, 테이블로 조회/검색/CSV 내보내기.
- FDE 로그인된 사람이면 누구나 접근.

## 비범위 (YAGNI)
- 댓글 본문 수집 안 함 (게시물 본문만, 댓글 수만)
- 카드/그리드 뷰 X (테이블만, 추후 추가 가능)
- 즐겨찾기/태깅/리뷰 상태 X (소연쌤 피드백 받고 추가)
- 비디오/스토리 X (게시물 메타데이터에 포함되긴 함)
- 알림 X

## 아키텍처
```
[/fde/dogilrok/insta-hashtag] (React)
        ↓ TanStack Query
[/fde-api/dogilrok/insta/*] (FastAPI)
   ↓
   ├─ FDE PostgreSQL (dogilrok_insta_hashtags, dogilrok_insta_posts)
   └─ instagrapi (버너 인스타 계정 세션)
        ↓
        Instagram private API

[Cron 04:00 KST] → backend/fde/jobs/insta_collect.py
```

## DB 스키마

```sql
CREATE TABLE dogilrok_insta_hashtags (
    id SERIAL PRIMARY KEY,
    tag TEXT UNIQUE NOT NULL,                 -- '#' 빼고 저장
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_collected_at TIMESTAMPTZ
);

CREATE TABLE dogilrok_insta_posts (
    id SERIAL PRIMARY KEY,
    post_pk TEXT UNIQUE NOT NULL,             -- 인스타 미디어 ID (중복 방지 키)
    shortcode TEXT NOT NULL,
    post_url TEXT NOT NULL,
    author_username TEXT,
    author_full_name TEXT,
    author_profile_pic_url TEXT,
    caption TEXT,
    media_type TEXT,                          -- photo/video/carousel
    thumbnail_url TEXT,
    like_count INT,
    comment_count INT,
    posted_at TIMESTAMPTZ,
    matched_tags TEXT[] NOT NULL DEFAULT '{}', -- 어떤 해시태그로 잡혔는지
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insta_posts_posted_at ON dogilrok_insta_posts (posted_at DESC);
CREATE INDEX idx_insta_posts_matched_tags ON dogilrok_insta_posts USING GIN (matched_tags);

INSERT INTO dogilrok_insta_hashtags (tag) VALUES ('팀버핏'), ('TEAMBUTFIT');
```

UPSERT 정책: `ON CONFLICT (post_pk) DO UPDATE SET matched_tags = ARRAY(SELECT DISTINCT UNNEST(matched_tags || EXCLUDED.matched_tags)), like_count = EXCLUDED.like_count, comment_count = EXCLUDED.comment_count, collected_at = NOW()`.

## 백엔드 라우터 (`backend/fde/routers/dogilrok_insta.py`)

| Method | Path | 설명 |
|---|---|---|
| GET | `/dogilrok/insta/hashtags` | 등록 해시태그 목록 |
| POST | `/dogilrok/insta/hashtags` | 등록 (`{tag}`) |
| DELETE | `/dogilrok/insta/hashtags/{id}` | 삭제 |
| PATCH | `/dogilrok/insta/hashtags/{id}` | active 토글 (`{is_active}`) |
| POST | `/dogilrok/insta/collect` | 즉석 수집 (`{tag, limit?}`), 동기 실행, 결과 요약 반환 |
| GET | `/dogilrok/insta/posts` | 게시물 조회 (`?tag=&search=&offset=&limit=&sort=`) |
| GET | `/dogilrok/insta/posts/export.csv` | 현재 필터 기준 CSV |

인증: 기존 FDE auth dependency (로그인된 사용자면 OK). 권한 분기 X.

## 수집 유틸 (`backend/fde/utils/insta_scraper.py`)
- `instagrapi.Client` + 세션 파일 캐시(`/etc/fde/insta_session.json`)
- 첫 실행: 환경변수의 ID/PW로 로그인 → 세션 저장
- `client.hashtag_medias_recent(tag, amount=30)` → `_upsert_post(media, tag)`
- 해시태그 사이 5초 sleep, 실패 시 3회 재시도 + 지수 백오프
- 로깅: 수집 건수/성공/실패/소요시간

## Cron (`backend/fde/jobs/insta_collect.py`)
- systemd timer 또는 root crontab `0 4 * * *`
- `is_active=true` 해시태그 순회, 각 30개 수집
- 결과를 stdout 로깅 (기존 cron 패턴과 동일)

## 프론트 (`frontend/packages/erp/src/pages/FDE/DoGilrok/InstaHashtag/`)

파일 구조:
```
InstaHashtag/
├── index.tsx              (페이지 컨테이너)
├── HashtagManager.tsx     (등록 해시태그 칩 + 추가/삭제)
├── CollectNow.tsx         (즉석 수집 입력)
├── PostsTable.tsx         (테이블 + 필터 + 페이징)
├── api.ts                 (TanStack Query hooks)
└── styles.module.css
```

라우트: `/fde/dogilrok/insta-hashtag` (App.tsx 등록, 사이드바 DoGilrok 메뉴 하위 추가)

테이블 컬럼: 썸네일, 작성자, 캡션(80자 ellipsis), 좋아요, 댓글, 게시일, 인스타 링크
필터: 태그 select(전체/등록된 해시태그), 검색(작성자/캡션 ILIKE), 정렬(게시일 desc/좋아요 desc), 페이징 50

## 길록쌤 준비물
1. 버너 인스타 계정 (가입 후 며칠 자연 사용 권장) — ID/PW 전달
2. EC2 `/etc/fde/insta_credentials.env` 작성, 권한 600
3. `pip install instagrapi` (requirements.txt 추가됨)
4. cron 등록 (배포 스크립트가 idempotent하게 처리)

## 리스크
- 버너 계정 차단 → 새 계정으로 교체 (운영 부담)
- 인스타 비공식 API 깨짐 → instagrapi 업데이트 추적
- Rate limit → 30개/태그/일은 안전권 (instagrapi 권장 패턴 내)
