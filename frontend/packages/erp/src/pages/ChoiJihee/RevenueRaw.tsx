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
}

const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
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
    setLoading(true);
    setError('');
    setSelectedBranch(null);
    try {
      const res = await fetch(`${API}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_start: dateStart,
          date_end: dateEnd,
          branch: [],
          category: [],
          include_refund: includeRefund,
          search: '',
          sort_by: null,
          sort_order: 'desc',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setFetched(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // 지점별 합산
  const branchMap = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const b = row.지점명 ?? '미분류';
    const prev = branchMap.get(b) ?? { total: 0, count: 0 };
    branchMap.set(b, { total: prev.total + (row.가격 ?? 0), count: prev.count + 1 });
  }
  const branches = [...branchMap.entries()].sort((a, b) => b[1].total - a[1].total);

  // 선택 지점의 일자별 합산
  const branchRows = selectedBranch ? rows.filter(r => r.지점명 === selectedBranch) : [];
  const dayMap = new Map<string, { total: number; rows: RevenueRow[] }>();
  for (const row of branchRows) {
    const day = String(row.결제일 ?? '').slice(0, 10);
    const prev = dayMap.get(day) ?? { total: 0, rows: [] };
    dayMap.set(day, { total: prev.total + (row.가격 ?? 0), rows: [...prev.rows, row] });
  }
  const days = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className={s.page}>
      {/* 필터 */}
      <div className={s.filterBar}>
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={s.input} />
        <span className={s.sep}>~</span>
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={s.input} />
        <label className={s.checkLabel}>
          <input type="checkbox" checked={includeRefund} onChange={e => setIncludeRefund(e.target.checked)} />
          환불 포함
        </label>
        <button onClick={fetchData} className={s.btn} disabled={loading}>
          {loading ? '조회 중…' : '조회'}
        </button>
      </div>

      {error && <p className={s.error}>{error}</p>}

      {!fetched && !loading && (
        <div className={s.empty}>날짜를 선택하고 조회 버튼을 누르세요</div>
      )}

      {fetched && (
        <div className={s.body}>
          {/* 좌측: 지점 목록 */}
          <div className={s.branchList}>
            <div className={s.listHeader}>지점별 매출</div>
            {branches.map(([branch, stat]) => (
              <button
                key={branch}
                className={`${s.branchItem} ${selectedBranch === branch ? s.active : ''}`}
                onClick={() => setSelectedBranch(branch === selectedBranch ? null : branch)}
              >
                <span className={s.branchName}>{branch}</span>
                <span className={s.branchTotal}>{fmt(stat.total)}원</span>
                <span className={s.branchCount}>{stat.count}건</span>
              </button>
            ))}
          </div>

          {/* 우측: 일자별 내역 */}
          <div className={s.detail}>
            {!selectedBranch && (
              <div className={s.empty}>지점을 클릭하면 일자별 내역이 표시됩니다</div>
            )}
            {selectedBranch && (
              <>
                <div className={s.detailHeader}>{selectedBranch} — 일자별 내역</div>
                <div className={s.dayList}>
                  {days.map(([day, stat]) => (
                    <div key={day} className={s.dayGroup}>
                      <div className={s.dayRow}>
                        <span className={s.dayLabel}>{day}</span>
                        <span className={s.dayTotal}>{fmt(stat.total)}원</span>
                        <span className={s.dayCount}>{stat.rows.length}건</span>
                      </div>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            <th>회원명</th>
                            <th>상품명</th>
                            <th>카테고리</th>
                            <th>가격</th>
                            <th>결제수단</th>
                            <th>상태</th>
                          </tr>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
