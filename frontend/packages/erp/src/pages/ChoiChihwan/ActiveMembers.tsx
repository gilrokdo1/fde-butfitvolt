import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActiveMembers, getActiveMemberPlaces, type ActiveMember } from '../../../api/fde';
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

export default function ActiveMembers() {
  const [placeId, setPlaceId] = useState<number | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>('회원이름');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: placesData } = useQuery({
    queryKey: ['choi-chihwan-places'],
    queryFn: () => getActiveMemberPlaces().then(r => r.data),
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

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.titleGroup}>
          <h1>유효회원 추출</h1>
          <p>현재 이용 중인 회원 · 복수 멤버십 보유 시 최고가 상품 기준 · 매시 정각 갱신</p>
        </div>
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
          {data && (
            <span className={s.badge}>총 {data.total.toLocaleString()}명</span>
          )}
          <button className={s.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '조회 중…' : '새로고침'}
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
