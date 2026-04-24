import { useState } from 'react';
import s from './RevenueRaw.module.css';

const API = `${import.meta.env.VITE_API_URL ?? ''}/fde-api/jihee/revenue`;

interface RevenueRow {
  지점명: string;
  결제일: string;
  가격: number;
  결제상태: string;
  회원명: string;
  상품명: string;
  카테고리: string;
  결제수단: string;
  온오프라인: string;
}

const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function fmt(n: number) { return n.toLocaleString('ko-KR'); }

type ViewType = '오프라인' | '온라인';

function BranchDetail({ rows }: { rows: RevenueRow[] }) {
  const [view, setView] = useState<ViewType>('오프라인');

  const filtered = rows.filter(r => {
    const v = (r.온오프라인 ?? '').trim();
    return view === '오프라인' ? v !== '온라인' : v === '온라인';
  });

  const dayMap = new Map<string, { total: number; rows: RevenueRow[] }>();
  for (const row of filtered) {
    const day = String(row.결제일 ?? '').slice(0, 10);
    const prev = dayMap.get(day) ?? { total: 0, rows: [] };
    dayMap.set(day, { total: prev.total + (row.가격 ?? 0), rows: [...prev.rows, row] });
  }
  const days = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const total = filtered.reduce((sum, r) => sum + (r.가격 ?? 0), 0);

  return (
    <div className={s.branchDetail}>
      <div className={s.viewToggle}>
        {(['오프라인', '온라인'] as ViewType[]).map(v => (
          <button key={v} className={`${s.viewBtn} ${view === v ? s.viewActive : ''}`} onClick={() => setView(v)}>
            {v}_영업집계
          </button>
        ))}
        <span className={s.totalBadge}>{fmt(total)}원 · {filtered.length}건</span>
      </div>
      <div className={s.dayList}>
        {days.length === 0 && <div className={s.noData}>데이터 없음</div>}
        {days.map(([day, stat]) => (
          <div key={day} className={s.dayGroup}>
            <div className={s.dayHeader}>
              <span className={s.dayLabel}>{day}</span>
              <span className={s.dayTotal}>{fmt(stat.total)}원</span>
              <span className={s.dayCnt}>{stat.rows.length}건</span>
            </div>
            <table className={s.table}>
              <thead>
                <tr><th>회원명</th><th>상품명</th><th>카테고리</th><th>가격</th><th>결제수단</th><th>상태</th></tr>
              </thead>
              <tbody>
                {stat.rows.map((row, i) => (
                  <tr key={i} className={row.결제상태 === '환불' || row.결제상태 === '취소' ? s.refund : ''}>
                    <td>{row.회원명}</td>
                    <td className={s.ellipsis}>{row.상품명}</td>
                    <td>{row.카테고리}</td>
                    <td className={s.right}>{fmt(row.가격)}</td>
                    <td>{row.결제수단}</td>
                    <td>{row.결제상태}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RevenueRaw() {
  const [dateStart, setDateStart] = useState(firstDay);
  const [dateEnd, setDateEnd] = useState(lastDay);
  const [includeRefund, setIncludeRefund] = useState(true);
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true); setError(''); setSelectedBranch(null);
    try {
      const res = await fetch(`${API}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_start: dateStart, date_end: dateEnd, branch: [], category: [], include_refund: includeRefund, search: '', sort_by: null, sort_order: 'desc' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setFetched(true);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const branchMap = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const b = row.지점명 ?? '미분류';
    const prev = branchMap.get(b) ?? { total: 0, count: 0 };
    branchMap.set(b, { total: prev.total + (row.가격 ?? 0), count: prev.count + 1 });
  }
  const branches = [...branchMap.entries()].sort((a, b) => b[1].total - a[1].total);
  const selectedRows = selectedBranch ? rows.filter(r => r.지점명 === selectedBranch) : [];

  return (
    <div className={s.page}>
      <div className={s.filterBar}>
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={s.input} />
        <span className={s.sep}>~</span>
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={s.input} />
        <label className={s.checkLabel}>
          <input type="checkbox" checked={includeRefund} onChange={e => setIncludeRefund(e.target.checked)} />
          환불 포함
        </label>
        <button onClick={fetchData} className={s.btn} disabled={loading}>{loading ? '조회 중…' : '조회'}</button>
      </div>
      {error && <p className={s.error}>{error}</p>}
      {!fetched && !loading && <div className={s.empty}>날짜를 선택하고 조회 버튼을 누르세요</div>}
      {fetched && (
        <div className={s.body}>
          <div className={s.branchList}>
            <div className={s.listHeader}>지점별 매출</div>
            {branches.map(([branch, stat]) => (
              <button key={branch} className={`${s.branchItem} ${selectedBranch === branch ? s.branchActive : ''}`} onClick={() => setSelectedBranch(branch === selectedBranch ? null : branch)}>
                <span className={s.branchName}>{branch}</span>
                <span className={s.branchTotal}>{fmt(stat.total)}원</span>
                <span className={s.branchCnt}>{stat.count}건</span>
              </button>
            ))}
          </div>
          <div className={s.detail}>
            {!selectedBranch && <div className={s.empty}>지점을 클릭하면 집계가 표시됩니다</div>}
            {selectedBranch && (
              <>
                <div className={s.detailHeader}>{selectedBranch}</div>
                <BranchDetail rows={selectedRows} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
