import { useState } from 'react';
import s from './RevenueRaw.module.css';

const API = `${import.meta.env.VITE_API_URL ?? ''}/fde-api/jihee/revenue`;

interface RevenueRow {
  지점명: string;
  회원명: string;
  연락처: string;
  결제상태: string;
  결제일: string;
  상품명: string;
  카테고리: string;
  가격: number;
  결제수단: string;
  [key: string]: unknown;
}

interface FilterResponse {
  total_count: number;
  total_price: number;
  positive_price: number;
  negative_price: number;
  data: RevenueRow[];
}

const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

export default function RevenueRaw() {
  const [dateStart, setDateStart] = useState(firstDay);
  const [dateEnd, setDateEnd] = useState(lastDay);
  const [includeRefund, setIncludeRefund] = useState(true);
  const [result, setResult] = useState<FilterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchData() {
    setLoading(true);
    setError('');
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
      setResult(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function formatPrice(n: number) {
    return n.toLocaleString('ko-KR') + '원';
  }

  return (
    <div className={s.container}>
      <div className={s.filterRow}>
        <label className={s.filterLabel}>
          결제일
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={s.input} />
          <span>~</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={s.input} />
        </label>
        <label className={s.filterLabel}>
          <input type="checkbox" checked={includeRefund} onChange={e => setIncludeRefund(e.target.checked)} />
          환불 포함
        </label>
        <button onClick={fetchData} className={s.btn} disabled={loading}>
          {loading ? '조회 중...' : '조회'}
        </button>
      </div>

      {error && <p className={s.error}>{error}</p>}

      {result && (
        <>
          <div className={s.summary}>
            <div className={s.summaryItem}>
              <span className={s.summaryLabel}>총 건수</span>
              <span className={s.summaryValue}>{result.total_count.toLocaleString()}건</span>
            </div>
            <div className={s.summaryItem}>
              <span className={s.summaryLabel}>순매출</span>
              <span className={s.summaryValue}>{formatPrice(result.total_price)}</span>
            </div>
            <div className={s.summaryItem}>
              <span className={s.summaryLabel}>매출</span>
              <span className={s.summaryValue}>{formatPrice(result.positive_price)}</span>
            </div>
            <div className={s.summaryItem}>
              <span className={s.summaryLabel}>환불</span>
              <span className={`${s.summaryValue} ${s.negative}`}>{formatPrice(result.negative_price)}</span>
            </div>
          </div>

          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>결제일</th>
                  <th>지점명</th>
                  <th>회원명</th>
                  <th>상품명</th>
                  <th>카테고리</th>
                  <th>가격</th>
                  <th>결제수단</th>
                  <th>결제상태</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row, i) => (
                  <tr key={i} className={row.결제상태 === '환불' || row.결제상태 === '취소' ? s.refundRow : ''}>
                    <td>{String(row.결제일 ?? '').slice(0, 10)}</td>
                    <td>{row.지점명}</td>
                    <td>{row.회원명}</td>
                    <td className={s.productCell}>{row.상품명}</td>
                    <td>{row.카테고리}</td>
                    <td className={s.priceCell}>{Number(row.가격).toLocaleString()}</td>
                    <td>{row.결제수단}</td>
                    <td>{row.결제상태}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className={s.empty}>날짜를 선택하고 조회 버튼을 누르세요</div>
      )}
    </div>
  );
}
