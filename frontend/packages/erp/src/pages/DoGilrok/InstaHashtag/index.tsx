import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInstaHashtags,
  createInstaHashtag,
  patchInstaHashtag,
  deleteInstaHashtag,
  collectInstaNow,
  getInstaPosts,
  downloadInstaPostsCsv,
  type InstaPost,
} from '../../../api/fde';
import s from './InstaHashtag.module.css';

const PAGE_SIZE = 50;

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateOnly(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function truncate(text: string | null, n: number) {
  if (!text) return '';
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// ── HashtagManager ──────────────────────────────────────────────────────────

function HashtagManager() {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState('');

  const { data } = useQuery({
    queryKey: ['insta-hashtags'],
    queryFn: () => getInstaHashtags().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (tag: string) => createInstaHashtag(tag),
    onSuccess: () => {
      setNewTag('');
      qc.invalidateQueries({ queryKey: ['insta-hashtags'] });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      patchInstaHashtag(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insta-hashtags'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteInstaHashtag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insta-hashtags'] }),
  });

  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>등록된 해시태그</h2>
      <p className={s.sectionHint}>매일 새벽 4시 자동 수집. 토글로 일시 정지 가능.</p>
      <div className={s.tagList}>
        {data?.hashtags.map((h) => (
          <div key={h.id} className={`${s.tagChip} ${!h.is_active ? s.tagChipOff : ''}`}>
            <span className={s.tagName}>#{h.tag}</span>
            <span className={s.tagMeta}>
              마지막 수집: {h.last_collected_at ? formatDateTime(h.last_collected_at) : '없음'}
            </span>
            <button
              className={s.tagToggle}
              onClick={() => toggle.mutate({ id: h.id, active: !h.is_active })}
            >
              {h.is_active ? '활성' : '정지'}
            </button>
            <button
              className={s.tagDelete}
              onClick={() => {
                if (window.confirm(`#${h.tag} 삭제? 누적된 게시물은 남습니다.`)) {
                  remove.mutate(h.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <form
        className={s.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (newTag.trim()) create.mutate(newTag.trim());
        }}
      >
        <input
          className={s.input}
          placeholder="해시태그 추가 (# 없이)"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
        />
        <button type="submit" className={s.btnPrimary} disabled={create.isPending}>
          {create.isPending ? '추가 중...' : '추가'}
        </button>
      </form>
    </section>
  );
}

// ── CollectNow ──────────────────────────────────────────────────────────────

function CollectNow() {
  const qc = useQueryClient();
  const [tag, setTag] = useState('');
  const [limit, setLimit] = useState(30);
  const [result, setResult] = useState<string>('');

  const collect = useMutation({
    mutationFn: () => collectInstaNow(tag.trim(), limit),
    onSuccess: (res) => {
      const r = res.data;
      setResult(
        `#${r.tag}: 가져옴 ${r.fetched} / 신규 ${r.inserted} / 갱신 ${r.updated} (${r.elapsed_sec}s)`,
      );
      qc.invalidateQueries({ queryKey: ['insta-posts'] });
      qc.invalidateQueries({ queryKey: ['insta-hashtags'] });
      setTimeout(() => setResult(''), 8000);
    },
    onError: (e: Error) => setResult(`실패: ${e.message}`),
  });

  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>즉석 수집</h2>
      <p className={s.sectionHint}>
        임의 해시태그 즉시 수집 (10~60초 소요). 결과는 누적 테이블에 저장됨.
      </p>
      <div className={s.collectRow}>
        <input
          className={s.input}
          placeholder="해시태그 (# 없이)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <input
          className={`${s.input} ${s.inputNumber}`}
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <button
          className={s.btnPrimary}
          onClick={() => tag.trim() && collect.mutate()}
          disabled={collect.isPending}
        >
          {collect.isPending ? '수집 중...' : '수집하기'}
        </button>
      </div>
      {result && <div className={s.collectResult}>{result}</div>}
    </section>
  );
}

// ── PostsTable ──────────────────────────────────────────────────────────────

interface PostsFilters {
  tag: string;
  search: string;
  sort: 'posted_at_desc' | 'posted_at_asc' | 'like_desc';
  offset: number;
}

function PostsTable() {
  const [filters, setFilters] = useState<PostsFilters>({
    tag: '',
    search: '',
    sort: 'posted_at_desc',
    offset: 0,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: hashtagsData } = useQuery({
    queryKey: ['insta-hashtags'],
    queryFn: () => getInstaHashtags().then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['insta-posts', filters],
    queryFn: () =>
      getInstaPosts({
        tag: filters.tag || undefined,
        search: filters.search || undefined,
        sort: filters.sort,
        offset: filters.offset,
        limit: PAGE_SIZE,
      }).then((r) => r.data),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1;

  const goPage = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setFilters((f) => ({ ...f, offset: (clamped - 1) * PAGE_SIZE }));
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadInstaPostsCsv({
        tag: filters.tag || undefined,
        search: filters.search || undefined,
        sort: filters.sort,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className={s.section}>
      <div className={s.tableHeader}>
        <h2 className={s.sectionTitle}>
          누적 게시물 <span className={s.totalBadge}>{data?.total ?? 0}</span>
        </h2>
        <button className={s.btnSecondary} onClick={handleDownload} disabled={downloading}>
          {downloading ? '준비 중...' : '📥 CSV 다운로드'}
        </button>
      </div>

      <div className={s.filters}>
        <select
          className={s.select}
          value={filters.tag}
          onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value, offset: 0 }))}
        >
          <option value="">전체 해시태그</option>
          {hashtagsData?.hashtags.map((h) => (
            <option key={h.id} value={h.tag}>
              #{h.tag}
            </option>
          ))}
        </select>
        <input
          className={s.input}
          placeholder="작성자 / 본문 검색"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, offset: 0 }))}
        />
        <select
          className={s.select}
          value={filters.sort}
          onChange={(e) =>
            setFilters((f) => ({ ...f, sort: e.target.value as PostsFilters['sort'], offset: 0 }))
          }
        >
          <option value="posted_at_desc">최신순</option>
          <option value="posted_at_asc">오래된순</option>
          <option value="like_desc">좋아요순</option>
        </select>
      </div>

      {isLoading && <p className={s.state}>불러오는 중...</p>}
      {data && data.posts.length === 0 && !isLoading && (
        <p className={s.state}>
          아직 수집된 게시물이 없습니다. 위 "즉석 수집"으로 시작해보세요.
        </p>
      )}

      {data && data.posts.length > 0 && (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>썸네일</th>
                  <th>작성자</th>
                  <th>본문</th>
                  <th>좋아요</th>
                  <th>댓글</th>
                  <th>게시일</th>
                  <th>해시태그</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p) => (
                  <PostRow
                    key={p.id}
                    post={p}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.pager}>
            <button onClick={() => goPage(currentPage - 1)} disabled={currentPage <= 1}>
              ← 이전
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button onClick={() => goPage(currentPage + 1)} disabled={currentPage >= totalPages}>
              다음 →
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PostRow({
  post,
  expanded,
  onToggle,
}: {
  post: InstaPost;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <td>
        {post.thumbnail_url ? (
          <img className={s.thumb} src={post.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <div className={s.thumbPlaceholder}>—</div>
        )}
      </td>
      <td className={s.author}>@{post.author_username ?? '-'}</td>
      <td className={s.captionCell} onClick={onToggle}>
        {expanded ? (
          <span className={s.captionFull}>{post.caption || '(본문 없음)'}</span>
        ) : (
          truncate(post.caption, 80) || '(본문 없음)'
        )}
      </td>
      <td className={s.num}>{post.like_count.toLocaleString()}</td>
      <td className={s.num}>{post.comment_count.toLocaleString()}</td>
      <td className={s.date}>{formatDateOnly(post.posted_at)}</td>
      <td className={s.tags}>{post.matched_tags.map((t) => `#${t}`).join(' ')}</td>
      <td>
        <a className={s.linkBtn} href={post.post_url} target="_blank" rel="noreferrer">
          ↗
        </a>
      </td>
    </tr>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function InstaHashtagPage() {
  return (
    <div className={s.container}>
      <header className={s.pageHeader}>
        <h1 className={s.pageTitle}>인스타 해시태그 수집기</h1>
        <p className={s.pageSubtitle}>
          등록한 해시태그 자동 수집 + 즉석 수집 + 누적 검색. 매일 새벽 4시 자동 갱신.
        </p>
      </header>
      <HashtagManager />
      <CollectNow />
      <PostsTable />
    </div>
  );
}
