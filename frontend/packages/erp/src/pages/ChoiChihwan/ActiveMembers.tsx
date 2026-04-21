import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getActiveMembers, getActiveMemberPlaces, getBranchSummary,
  getMonthlyTrend, downloadActiveMembersCsv,
  type ActiveMember,
} from '../../api/fde';
import s from './ActiveMembers.module.css';

type SortKey = keyof Pick<ActiveMember, '회원이름' | '지점' | '멤버십명' | '카테고리' | '시작일' | '종료일' | '결제금액'>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: '회원이름', label: '이름' },
  { key: '지점',    label: '지점' },
  { key: '멤버십명', label: '멤버십' },
  { key: '카테고리', label: '카테고리' },
  { key: '시작일',  label: '시작일' },
  { key: '종료일',  label: '종료일' },
  { key: '결제금액', label: '결제금액' },
];

function categoryClass(cat: string | null) {
  if (!cat) return s.catEtc;
  if (cat.includes('PT')) return s.catPT;
  if (cat.includes('피트니스')) return s.catFitness;
  if (cat.includes('팀버핏')) return s.catTeamfit;
  if (cat.includes('요가')) return s.catYoga;
  return s.catEtc;
}

function formatAmount(n: number) {
  return n ? n.toLocaleString('ko-KR') + '원' : '-';
}

function TrendChart({ placeId }: { placeId?: number }) {
  const { data } = useQuery({
    queryKey: ['choi-chihwan-trend', placeId],
    queryFn: () => getMonthlyTrend(placeId).then(r => r.data.data),
  });

  if (!data || data.length === 0) return null;

  const W = 600, H = 160, PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map(d => d.유효회원수), 1);
  const xStep = chartW / (data.length - 1 || 1);

  const pts = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + chartH - (d.유효회원수 / max) * chartH,
    val: d.유효회원수,
    label: d.month.slice(5),
  }));

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0].x},${PAD.top + chartH} ` +
    pts.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${pts[pts.length - 1].x},${PAD.top + chartH} Z`;

  const yTicks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.chart}>
      {yTicks.map(v => {
        const y = PAD.top + chartH - (v / max) * chartH;
        return (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--border-primary)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{v.toLocaleString()}</text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5B5FC7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#5B5FC7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendGrad)" />
      <polyline points={polyline} fill="none" stroke="#5B5FC7" strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="#5B5FC7" />
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ActiveMembers() {
  const [placeId, setPlaceId] = useState<number | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>('회원이름');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [downloading, setDownloading] = useState(false);

  const { data: placesData } = useQuery({
    queryKey: ['choi-chihwan-places'],
    queryFn: () => getActiveMemberPlaces().then(r => r.data),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['choi-chihwan-branch-summary'],
    queryFn: () => getBranchSummary().then(r => r.data),
  });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['choi-chihwan-active-members', placeId, sortKey, sortOrder],
    queryFn: () =>
      getActiveMembers({ place_id: placeId, sort_by: sortKey, sort_order: sortOrder }).then(r => r.data),
  });

  const members = useMemo(() => data?.data ?? [], [data]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try { await downloadActiveMembersCsv(placeId); }
    finally { setDownloading(false); }
  }

  const selectedPlace = summaryData?.data.find(b => b.place_id === placeId);

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.titleGroup}>
          <h1>유효회원 추출</h1>
          <p>현재 이용 중인 회원 · 복수 멤버십 보유 시 최고가 상품 기준 · 매시 정각 갱신</p>
        </div>
      </div>

      {/* 지점별 요약 카드 */}
      {summaryData && (
        <div className={s.summaryWrap}>
          <div className={s.summaryHeader}>
            <span className={s.summaryTitle}>지점별 유효회원</span>
            <span className={s.summaryTotal}>전체 {summaryData.total.toLocaleString()}명</span>
          </div>
          <div className={s.summaryGrid}>
            {summaryData.data.map((b) => (
              <button
                key={b.place_id}
                className={`${s.summaryCard} ${placeId === b.place_id ? s.summaryCardActive : ''}`}
                onClick={() => setPlaceId(prev => prev === b.place_id ? undefined : b.place_id)}
              >
                <span className={s.summaryPlace}>{b.place}</span>
                <span className={s.summaryCount}>{b.유효회원수.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 월별 추이 그래프 */}
      <div className={s.chartWrap}>
        <div className={s.chartHeader}>
          <span className={s.chartTitle}>
            월별 유효회원 추이 {selectedPlace ? `— ${selectedPlace.place}` : '(전체)'}
          </span>
        </div>
        <TrendChart placeId={placeId} />
      </div>

      {/* 상세 목록 */}
      <div className={s.listHeader}>
        <div className={s.controls}>
          <select
            className={s.select}
            value={placeId ?? ''}
            onChange={e => setPlaceId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value=''>전체 지점</option>
            {placesData?.places.map(p => (
              <option key={p.place_id} value={p.place_id}>{p.place_name}</option>
            ))}
          </select>
          {data && <span className={s.badge}>총 {data.total.toLocaleString()}명</span>}
          <button className={s.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '조회 중…' : '새로고침'}
          </button>
          <button className={s.csvBtn} onClick={handleDownload} disabled={downloading}>
            {downloading ? '다운로드 중…' : 'CSV 다운로드'}
          </button>
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`${s.sortable} ${sortKey === col.key ? s.sortActive : ''}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <span className={s.sortIcon}>
                    {sortKey === col.key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </th>
              ))}
              <th>연락처</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && members.length === 0 ? (
              <tr><td colSpan={9} className={s.loading}>불러오는 중…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={9} className={s.empty}>데이터가 없습니다.</td></tr>
            ) : (
              members.map((m, i) => (
                <tr key={`${m.user_id}-${m.place_id}`}>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{i + 1}</td>
                  <td>{m.회원이름}</td>
                  <td>{m.지점}</td>
                  <td>{m.멤버십명}</td>
                  <td>
                    <span className={`${s.categoryBadge} ${categoryClass(m.카테고리)}`}>
                      {m.카테고리 ?? '기타'}
                    </span>
                  </td>
                  <td>{m.시작일?.slice(0, 10)}</td>
                  <td>{m.종료일?.slice(0, 10)}</td>
                  <td className={s.amount}>{formatAmount(m.결제금액)}</td>
                  <td style={{ color: 'var(--text-tertiary)' }}>{m.연락처}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
