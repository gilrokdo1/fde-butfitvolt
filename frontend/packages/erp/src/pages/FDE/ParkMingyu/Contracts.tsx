import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getContracts, uploadContracts, type ContractComputedStatus } from '../../../api/fde';
import s from './Contracts.module.css';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all',    label: '전체' },
  { key: '미서명', label: '미서명' },
  { key: '갱신필요', label: '갱신 필요' },
  { key: '기한초과', label: '기한 초과' },
  { key: '완료',   label: '완료' },
];

const BADGE_STYLE: Record<ContractComputedStatus, { bg: string; color: string }> = {
  미서명:  { bg: '#ef444422', color: '#ef4444' },
  갱신필요:{ bg: '#f59e0b22', color: '#d97706' },
  기한초과:{ bg: '#94a3b822', color: '#64748b' },
  완료:    { bg: '#22c55e22', color: '#16a34a' },
  알수없음:{ bg: '#e2e8f022', color: '#94a3b8' },
};

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

function formatDateTime(d: string | null) {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function extractBranch(title: string | null): string {
  if (!title) return '-';
  const m = title.match(/\[([^\]]+)\]/);
  return m ? m[1] : '-';
}

export default function Contracts() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parkmingyu-contracts', activeTab, search],
    queryFn: () => getContracts(activeTab, search).then((r) => r.data),
  });

  const { mutate: upload, isPending: uploading } = useMutation({
    mutationFn: (file: File) => uploadContracts(file).then((r) => r.data),
    onSuccess: (result) => {
      alert(`업로드 완료: ${result.inserted}건 저장됨`);
      queryClient.invalidateQueries({ queryKey: ['parkmingyu-contracts'] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      alert(`업로드 실패: ${err.response?.data?.detail ?? '알 수 없는 오류'}`);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  }

  const summary = data?.summary;

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>박민규</h1>
          <p className={s.team}>TB SV — 프리랜서 코치 계약 추적</p>
        </div>
        <div className={s.uploadArea}>
          {data?.uploaded_at && (
            <span className={s.lastUpdate}>
              마지막 업로드: {formatDateTime(data.uploaded_at)}
            </span>
          )}
          <button
            className={s.uploadBtn}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '업로드 중...' : 'CSV 업로드'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* 요약 카드 */}
      <div className={s.cards}>
        <div className={s.card} onClick={() => setActiveTab('미서명')} style={{ cursor: 'pointer' }}>
          <span className={s.cardLabel}>미서명</span>
          <span className={s.cardValue} style={{ color: '#ef4444' }}>
            {summary ? summary['미서명'] : '-'}
          </span>
        </div>
        <div className={s.card} onClick={() => setActiveTab('갱신필요')} style={{ cursor: 'pointer' }}>
          <span className={s.cardLabel}>갱신 필요 <span className={s.hint}>(80일+)</span></span>
          <span className={s.cardValue} style={{ color: '#d97706' }}>
            {summary ? summary['갱신필요'] : '-'}
          </span>
        </div>
        <div className={s.card} onClick={() => setActiveTab('기한초과')} style={{ cursor: 'pointer' }}>
          <span className={s.cardLabel}>기한 초과</span>
          <span className={s.cardValue} style={{ color: '#64748b' }}>
            {summary ? summary['기한초과'] : '-'}
          </span>
        </div>
        <div className={s.card} onClick={() => setActiveTab('all')} style={{ cursor: 'pointer' }}>
          <span className={s.cardLabel}>전체</span>
          <span className={s.cardValue}>
            {summary ? summary.total : '-'}
          </span>
        </div>
      </div>

      {/* 필터 탭 + 검색 */}
      <div className={s.toolbar}>
        <div className={s.tabs}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              className={activeTab === t.key ? s.tabActive : s.tab}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key !== 'all' && summary && t.key in summary
                ? ` (${summary[t.key as keyof typeof summary]})`
                : ''}
            </button>
          ))}
        </div>
        <input
          className={s.search}
          placeholder="이름 / 연락처 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 테이블 */}
      <div className={s.tableWrap}>
        {isLoading && <div className={s.state}>불러오는 중...</div>}
        {isError && <div className={s.stateError}>데이터 조회 중 오류가 발생했습니다.</div>}
        {!isLoading && !isError && (!data || data.contracts.length === 0) && (
          <div className={s.state}>
            {!data || data.uploaded_at === null
              ? 'CSV를 업로드해 주세요.'
              : '해당 조건의 계약이 없습니다.'}
          </div>
        )}
        {!isLoading && !isError && data && data.contracts.length > 0 && (
          <table className={s.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>지점</th>
                <th>문서 제목</th>
                <th>요청일</th>
                <th>서명일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.map((c) => {
                const badgeStyle = BADGE_STYLE[c.computed_status] ?? BADGE_STYLE['알수없음'];
                return (
                  <tr key={c.id}>
                    <td className={s.nameCell}>{c.signer_name}</td>
                    <td className={s.mono}>{c.signer_contact ?? '-'}</td>
                    <td>{extractBranch(c.doc_title)}</td>
                    <td className={s.titleCell}>{c.doc_title ?? '-'}</td>
                    <td className={s.mono}>{formatDate(c.request_date)}</td>
                    <td className={s.mono}>{formatDate(c.sign_date)}</td>
                    <td>
                      <span
                        className={s.badge}
                        style={{ background: badgeStyle.bg, color: badgeStyle.color }}
                      >
                        {c.computed_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
