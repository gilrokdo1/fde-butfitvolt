import { useEffect, useState, useCallback } from 'react';
import {
  getSalesOverview,
  getSalesRevenue,
  getSalesFtNew,
  getSalesPtTrial,
  getSalesRereg,
  getSalesSubscription,
  getSalesAvailableDates,
  type SalesOverview,
  type RevenueRow,
  type FtNewRow,
  type PtTrialRow,
  type ReregRow,
  type SubscriptionRow,
} from '../../../../api/fde';
import s from './SalesAnalysis.module.css';

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function rateClass(rate: number, threshold = 30): string {
  if (rate >= threshold * 1.2) return s.up ?? '';
  if (rate < threshold * 0.7) return s.down ?? '';
  return '';
}

// 월 옵션 생성 (최근 6개월)
function getMonthOptions(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export default function SalesAnalysis() {
  const [month, setMonth] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('month') ?? getMonthOptions()[0] ?? '';
  });
  const [dateStr, setDateStr] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('date') || '';
  });
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<SalesOverview['data'] | null>(null);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [ftNew, setFtNew] = useState<FtNewRow[]>([]);
  const [ptTrial, setPtTrial] = useState<PtTrialRow[]>([]);
  const [rereg, setRereg] = useState<ReregRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRow[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);

  const fetchData = useCallback(async (m: string, d?: string) => {
    setLoading(true);
    try {
      const [ovRes, revRes, ftRes, ptRes, reregRes, subRes] = await Promise.all([
        getSalesOverview(m, d),
        getSalesRevenue(m, d),
        getSalesFtNew(m, d),
        getSalesPtTrial(m, d),
        getSalesRereg(m, d),
        getSalesSubscription(m, d),
      ]);
      setOverview(ovRes.data.data);
      setRevenue(revRes.data.data);
      setFtNew(ftRes.data.data);
      setPtTrial(ptRes.data.data);
      setRereg(reregRes.data.data);
      setSubscription(subRes.data.data);
      setSnapshotDate(ovRes.data._meta?.snapshot_date || null);
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 월 변경 시 available dates 갱신
  useEffect(() => {
    getSalesAvailableDates(month).then((res) => {
      setAvailableDates(res.data.dates || []);
    }).catch(() => setAvailableDates([]));
  }, [month]);

  // 데이터 fetch
  useEffect(() => {
    fetchData(month, dateStr || undefined);
  }, [month, dateStr, fetchData]);

  // URL 파라미터 동기화
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('month', month);
    if (dateStr) params.set('date', dateStr);
    const newUrl = `${window.location.pathname}?${params}`;
    window.history.replaceState(null, '', newUrl);
  }, [month, dateStr]);

  if (loading) {
    return <div className={s.loading}>데이터를 불러오는 중...</div>;
  }

  if (!overview) {
    return (
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>실적 분석</h1>
        </div>
        <div className={s.empty}>
          해당 월의 스냅샷 데이터가 없습니다.<br />
          백엔드에서 스냅샷을 생성해주세요.
        </div>
      </div>
    );
  }

  const revTotal = revenue.reduce(
    (acc, r) => ({ ft: acc.ft + r.ft, pt: acc.pt + r.pt, total: acc.total + r.total, target: acc.target + r.target }),
    { ft: 0, pt: 0, total: 0, target: 0 },
  );

  const ftNewTotal = ftNew.reduce(
    (acc, r) => ({
      bs1: acc.bs1 + r.bs1_count,
      revenue: acc.revenue + r.bs1_revenue,
      prevM: acc.prevM + r.prev_month_same_period,
      prevY: acc.prevY + r.prev_year_same_period,
      target: acc.target + r.target_count,
    }),
    { bs1: 0, revenue: 0, prevM: 0, prevY: 0, target: 0 },
  );

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <h1 className={s.title}>{month.replace('-', '년 ')}월 실적 분석</h1>
        <div className={s.meta}>
          <span>{month}-01 ~ {snapshotDate || '?'} (어제까지)</span>
          <span>전 지점</span>
          <span className={s.badge}>영업기획실</span>
        </div>
      </div>

      {/* 날짜 필터 */}
      <div className={s.filterRow}>
        <select className={s.filterSelect} value={month} onChange={(e) => { setMonth(e.target.value); setDateStr(''); }}>
          {getMonthOptions().map((m) => (
            <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
          ))}
        </select>
        <select className={s.filterSelect} value={dateStr} onChange={(e) => setDateStr(e.target.value)}>
          <option value="">최신 스냅샷</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* 요약 카드 */}
      <div className={s.summaryGrid}>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>FT+PT 매출</div>
          <div className={s.cardValue}>
            {(overview.revenue.total / 10000).toFixed(1)}<span className={s.cardUnit}>억</span>
          </div>
          <div className={s.cardSub}>목표 {(overview.revenue.target / 10000).toFixed(1)}억 · 달성률 {pct(overview.revenue.rate)}</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>FT 신규 (BS 1회차)</div>
          <div className={s.cardValue}>
            {fmt(overview.bs1.count)}<span className={s.cardUnit}>명</span>
          </div>
          <div className={s.cardSub}>목표 {fmt(overview.bs1.target)}명 · {pct(overview.bs1.rate)}</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>FT 재등록률 (어제까지)</div>
          <div className={s.cardValue}>
            {overview.rereg.rate.toFixed(1)}<span className={s.cardUnit}>%</span>
          </div>
          <div className={s.cardSub}>대상 {fmt(overview.rereg.targets)}명 중 {fmt(overview.rereg.paid + overview.rereg.pre_paid)}명</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>구독 이탈률 (어제까지)</div>
          <div className={s.cardValue}>
            {overview.churn.rate.toFixed(1)}<span className={s.cardUnit}>%</span>
          </div>
          <div className={s.cardSub}>만료대상 {fmt(overview.churn.total)}명 중 {fmt(overview.churn.churn)}명 이탈</div>
        </div>
      </div>

      {/* 섹션1: 매출 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>1. 실적 총괄</div>
        <div className={s.sectionDesc}>FT+PT 매출 목표 대비 달성률 (만원, VAT 제외)</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th><th>FT</th><th>FT 목표</th><th>FT%</th>
                <th>PT</th><th>PT 목표</th><th>PT%</th>
                <th>합계</th><th>목표</th><th>달성률</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((r) => (
                <tr key={r.branch}>
                  <td>{r.branch}</td>
                  <td>{fmt(r.ft)}</td><td>{fmt(r.ft_target)}</td>
                  <td className={rateClass(r.ft_rate)}>{pct(r.ft_rate)}</td>
                  <td>{fmt(r.pt)}</td><td>{fmt(r.pt_target)}</td>
                  <td className={rateClass(r.pt_rate)}>{pct(r.pt_rate)}</td>
                  <td>{fmt(r.total)}</td><td>{fmt(r.target)}</td>
                  <td className={rateClass(r.total_rate)}>{pct(r.total_rate)}</td>
                </tr>
              ))}
              <tr className={s.totalRow}>
                <td>전체</td>
                <td>{fmt(revTotal.ft)}</td><td></td><td></td>
                <td>{fmt(revTotal.pt)}</td><td></td><td></td>
                <td>{fmt(revTotal.total)}</td><td>{fmt(revTotal.target)}</td>
                <td>{revTotal.target > 0 ? pct(revTotal.total / revTotal.target * 100) : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션2: FT 신규 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>2. FT 신규 (BS 1회차)</div>
        <div className={s.sectionDesc}>지점별 FT 신규 회원 현황 및 전월/전년 동기간 비교</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th><th>BS1 결제자</th><th>BS1 매출(만)</th>
                <th>전월 동기간</th><th>전년 동기간</th><th>목표</th>
                <th>달성률</th>
              </tr>
            </thead>
            <tbody>
              {ftNew.map((r) => {
                const rate = r.target_count > 0 ? r.bs1_count / r.target_count * 100 : 0;
                return (
                  <tr key={r.branch}>
                    <td>{r.branch}</td>
                    <td>{fmt(r.bs1_count)}</td>
                    <td>{fmt(r.bs1_revenue)}</td>
                    <td>{fmt(r.prev_month_same_period)}</td>
                    <td>{fmt(r.prev_year_same_period)}</td>
                    <td>{fmt(r.target_count)}</td>
                    <td className={rateClass(rate, 40)}>{pct(rate)}</td>
                  </tr>
                );
              })}
              <tr className={s.totalRow}>
                <td>전체</td>
                <td>{fmt(ftNewTotal.bs1)}</td>
                <td>{fmt(ftNewTotal.revenue)}</td>
                <td>{fmt(ftNewTotal.prevM)}</td>
                <td>{fmt(ftNewTotal.prevY)}</td>
                <td>{fmt(ftNewTotal.target)}</td>
                <td>{ftNewTotal.target > 0 ? pct(ftNewTotal.bs1 / ftNewTotal.target * 100) : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션3: PT 체험 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>3. PT 체험권 판매 실적</div>
        <div className={s.sectionDesc}>체험권 판매(단독/결합) 및 체험전환 현황</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th><th>체험 결제자</th><th>단독</th><th>결합</th>
                <th>전환 대상</th><th>전환 결제</th><th>전환율</th>
              </tr>
            </thead>
            <tbody>
              {ptTrial.map((r) => {
                const convRate = r.conversion_target > 0 ? r.conversion_count / r.conversion_target * 100 : 0;
                return (
                  <tr key={r.branch}>
                    <td>{r.branch}</td>
                    <td>{fmt(r.trial_count)}</td>
                    <td>{fmt(r.solo_count)}</td>
                    <td>{fmt(r.combo_count)}</td>
                    <td>{fmt(r.conversion_target)}</td>
                    <td>{fmt(r.conversion_count)}</td>
                    <td className={rateClass(convRate, 20)}>{pct(convRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션4: 재등록률 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>4. 재등록률</div>
        <div className={s.sectionDesc}>FT 기간권 재등록률 = (결제자 + 기결제자) / 대상자</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th><th>대상자</th><th>기결제</th><th>결제</th><th>재등록률</th>
              </tr>
            </thead>
            <tbody>
              {rereg.map((r) => (
                <tr key={`${r.branch}-${r.category}-${r.period_type}`}>
                  <td>{r.branch}</td>
                  <td>{fmt(r.target_count)}</td>
                  <td>{fmt(r.pre_paid_count)}</td>
                  <td>{fmt(r.paid_count)}</td>
                  <td className={rateClass(r.rereg_rate, 30)}>{pct(r.rereg_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 섹션5: 구독이탈 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>5. 구독 이탈 분석</div>
        <div className={s.sectionDesc}>구독 만료 대상자 중 이탈/유지/복귀/전환 분류</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th><th>대상</th><th>유지</th><th>복귀</th>
                <th>기간권전환</th><th>이탈</th><th>해지예정</th><th>이탈률</th>
              </tr>
            </thead>
            <tbody>
              {subscription.map((r) => (
                <tr key={r.branch}>
                  <td>{r.branch}</td>
                  <td>{fmt(r.total_count)}</td>
                  <td>{fmt(r.maintain_count)}</td>
                  <td>{fmt(r.return_count)}</td>
                  <td>{fmt(r.term_convert_count)}</td>
                  <td>{fmt(r.churn_count)}</td>
                  <td>{fmt(r.pending_cancel_count)}</td>
                  <td className={r.churn_rate > 30 ? s.down : r.churn_rate < 20 ? s.up : ''}>{pct(r.churn_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 데이터 기준 */}
      <div className={s.dataMeta}>
        데이터 기준: {snapshotDate || '-'} 스냅샷 · 대시보드와 매출 합계 ~1% 이내 차이 가능 (revenue_cash 매핑 차이)
      </div>
    </div>
  );
}
