import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnomalies, resolveAnomaly, triggerDetect, type Anomaly } from '../../api/fde';
import s from './AnomalyDashboard.module.css';

const TYPE_LABEL: Record<string, string> = {
  no_fitness: '멤버십 확인 필요',
  teamfit_overlap: '기간 중첩',
};

const TYPE_DESC: Record<string, string> = {
  no_fitness: '팀버핏과 피트니스 기간이 일치하지 않음',
  teamfit_overlap: '서로 다른 팀버핏의 기간이 겹침',
};

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

function formatPhone(p: string | null) {
  if (!p) return '-';
  const digits = p.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

function AnomalyRow({ row, onResolve }: { row: Anomaly; onResolve: (id: number) => void }) {
  return (
    <tr className={row.status === 'resolved' ? s.rowResolved : ''}>
      <td>
        <span className={`${s.typeBadge} ${s[row.anomaly_type]}`}>
          {TYPE_LABEL[row.anomaly_type]}
        </span>
      </td>
      <td>{row.user_name ?? '-'}</td>
      <td className={s.phone}>{formatPhone(row.phone_number)}</td>
      <td>{row.teamfit_mbs_name ?? '-'}</td>
      <td className={s.dateRange}>
        {formatDate(row.teamfit_begin)} ~ {formatDate(row.teamfit_end)}
        {row.overlap_mbs_id && (
          <div className={s.overlapRange}>
            중첩: {formatDate(row.overlap_begin)} ~ {formatDate(row.overlap_end)}
          </div>
        )}
      </td>
      <td className={s.detectedAt}>{formatDate(row.detected_at)}</td>
      <td>
        {row.status === 'pending' ? (
          <button className={s.resolveBtn} onClick={() => onResolve(row.id)}>
            처리완료
          </button>
        ) : (
          <span className={s.resolvedLabel}>완료</span>
        )}
      </td>
    </tr>
  );
}

export default function AnomalyDashboard() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'no_fitness' | 'teamfit_overlap'>('all');
  const [placeTab, setPlaceTab] = useState<string>('전체');
  const [detectMsg, setDetectMsg] = useState('');

  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['anomalies', statusFilter, typeFilter],
    queryFn: () =>
      getAnomalies({ status: statusFilter, anomaly_type: typeFilter }).then((r) => r.data),
  });

  const resolveMutation = useMutation({
    mutationFn: resolveAnomaly,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['anomalies'] }),
  });

  const detectMutation = useMutation({
    mutationFn: triggerDetect,
    onSuccess: (res) => {
      setDetectMsg(
        `감지 완료 — 케이스A: ${res.data.case_a}건, 케이스B: ${res.data.case_b}건, 신규: ${res.data.inserted}건, 자동처리: ${res.data.auto_resolved}건`,
      );
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      setTimeout(() => setDetectMsg(''), 5000);
    },
  });

  // 지점 탭 목록 (전체 + bplace PK 순)
  const places = data
    ? ['전체', ...(data.place_order ?? [])]
    : ['전체'];

  // 현재 탭에 맞게 필터된 데이터
  const filtered =
    data?.data.filter((r) => placeTab === '전체' || r.place === placeTab) ?? [];

  const pendingCount = filtered.filter((r) => r.status === 'pending').length;

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>멤버십 이상 감지</h1>
          <p className={s.subtitle}>매일 새벽 3시 자동 감지 · 코치 처리 트래킹</p>
        </div>
        <button
          className={s.detectBtn}
          onClick={() => detectMutation.mutate()}
          disabled={detectMutation.isPending}
        >
          {detectMutation.isPending ? '감지 중...' : '지금 감지 실행'}
        </button>
      </div>

      {detectMsg && <div className={s.detectMsg}>{detectMsg}</div>}

      {/* 전체 요약 */}
      {data && (
        <div className={s.summary}>
          <div className={s.summaryItem}>
            <span className={s.summaryNum}>{data.pending}</span>
            <span className={s.summaryLabel}>미처리</span>
          </div>
          <div className={s.summaryDivider} />
          <div className={s.summaryItem}>
            <span className={s.summaryNum}>{data.resolved}</span>
            <span className={s.summaryLabel}>처리완료</span>
          </div>
          <div className={s.summaryDivider} />
          <div className={s.summaryItem}>
            <span className={s.summaryNum}>{data.total}</span>
            <span className={s.summaryLabel}>전체</span>
          </div>
        </div>
      )}

      {/* 지점 탭 */}
      <div className={s.placeTabs}>
        {places.map((place) => {
          const cnt =
            data?.data.filter(
              (r) =>
                (place === '전체' || r.place === place) && r.status === 'pending',
            ).length ?? 0;
          return (
            <button
              key={place}
              className={`${s.placeTab} ${placeTab === place ? s.placeTabActive : ''}`}
              onClick={() => setPlaceTab(place)}
            >
              {place}
              {cnt > 0 && <span className={s.badge}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* 상태 필터 */}
      <div className={s.filters}>
        <div className={s.filterGroup}>
          {(['all', 'pending', 'resolved'] as const).map((v) => (
            <button
              key={v}
              className={`${s.filterBtn} ${statusFilter === v ? s.active : ''}`}
              onClick={() => setStatusFilter(v)}
            >
              {v === 'pending' ? '미처리' : v === 'resolved' ? '처리완료' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {/* 유형 필터 */}
      <div className={s.filters}>
        <div className={s.filterGroup}>
          {(['all', 'no_fitness', 'teamfit_overlap'] as const).map((v) => (
            <button
              key={v}
              className={`${s.filterBtn} ${typeFilter === v ? s.active : ''}`}
              onClick={() => setTypeFilter(v)}
            >
              {v === 'all' ? '전체' : TYPE_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className={s.legend}>
        {Object.entries(TYPE_DESC).map(([type, desc]) => (
          <div key={type} className={s.legendItem}>
            <span className={`${s.typeBadge} ${s[type]}`}>{TYPE_LABEL[type]}</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      {isLoading && <p className={s.state}>불러오는 중...</p>}
      {isError && <p className={s.stateError}>데이터를 불러오지 못했습니다.</p>}
      {data && filtered.length === 0 && <p className={s.state}>해당하는 케이스가 없습니다.</p>}

      {/* 테이블 */}
      {filtered.length > 0 && (
        <>
          <p className={s.tabSummary}>
            {placeTab} · 미처리 <strong>{pendingCount}</strong>건
          </p>
          <table className={s.table}>
            <thead>
              <tr>
                <th>유형</th>
                <th>회원이름</th>
                <th>연락처</th>
                <th>멤버십명</th>
                <th>팀버핏 기간</th>
                <th>감지일</th>
                <th>처리여부</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <AnomalyRow
                  key={row.id}
                  row={row}
                  onResolve={(id) => resolveMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
