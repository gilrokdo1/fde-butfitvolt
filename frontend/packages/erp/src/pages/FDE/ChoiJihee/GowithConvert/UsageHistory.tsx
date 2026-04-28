import { useState, useMemo } from 'react';
import type { MonthData, RowData } from './types';
import s from './UsageHistory.module.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://fde.butfitvolt.click';
const DATA_KEY = (ym: string) => `gowith_data_${ym}`;
const META_KEY = 'gowith_uploaded_files';

// ── 고위드 API 응답 타입 ───────────────────────────────────────
interface GowithExpense {
  expenseId: number;
  expenseDate: string;
  expenseTime: string;
  krwAmount: number;
  currency: string;
  approvedAmount: number | null;
  approvalStatus: string;
  purpose: { name: string } | null;
  cardAlias: string;
  cardUserName: string;
  shortCardNumber: string;
  storeName: string;
  storeAddress: string | null;
  memo: string | null;
  journalDate: string | null;
  syncedAt: string | null;
}

// ── 승인상태 표시 ───────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  NOT_SUBMITTED: '미제출',
  SUBMITTED: '제출됨',
  APPROVED: '승인',
  REJECTED: '반려',
  PARTIALLY_APPROVED: '부분승인',
};
const STATUS_CLASS: Record<string, string> = {
  NOT_SUBMITTED: 'statusGray',
  SUBMITTED: 'statusBlue',
  APPROVED: 'statusGreen',
  REJECTED: 'statusRed',
  PARTIALLY_APPROVED: 'statusOrange',
};

// ── 금액 포맷 ──────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

// ── 날짜 포맷: "20260427" → "2026.04.27" ──────────────────────
function fmtDate(d: string) {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

// ── 시간 포맷: "183520" → "18:35" ─────────────────────────────
function fmtTime(t: string) {
  if (t.length < 4) return t;
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
}

// ── API 응답 → RowData 변환 ────────────────────────────────────
function toRowData(exp: GowithExpense, ym: string): RowData {
  const parts = exp.shortCardNumber.split(' ');
  const rawCompany = parts[0] ?? '';
  const last4 = parts[1] ?? '';
  const cardCompanyMap: Record<string, string> = {
    '롯데': '롯데카드', '신한': '신한카드', 'BC': 'BC카드', '현대': '현대카드',
    '삼성': '삼성카드', '국민': '국민카드', '하나': '하나카드', '우리': '우리카드',
  };
  const cardCompany = cardCompanyMap[rawCompany] ?? rawCompany;

  return {
    id: `${ym}_api_${exp.expenseId}`,
    usageDate: exp.expenseDate,
    cardCompany,
    cardNumber: last4,
    approvalNumber: '',
    amount: exp.krwAmount,
    memo: exp.memo ?? '',
    cardNickname: exp.cardAlias,
    submitter: exp.cardUserName,
    accountSubject: '',
    approvedAmount: exp.approvedAmount ?? 0,
    rejectedAmount: 0,
    nonDeductible: false,
    businessType: '',
    domesticForeign: exp.currency !== 'KRW' ? '국외' : '국내',
  };
}

// ── 현재연월 구하기 ────────────────────────────────────────────
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── 연월 목록 (최근 12개월) ────────────────────────────────────
function getRecentMonths(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function fmtYM(ym: string) {
  return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4, 6))}월`;
}

// ── 필터 옵션 ──────────────────────────────────────────────────
type FilterKey = 'approvalStatus' | 'cardAlias' | 'currency';

export default function UsageHistory() {
  const [selectedYM, setSelectedYM] = useState(getCurrentYearMonth);
  const [expenses, setExpenses] = useState<GowithExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});

  const months = useMemo(getRecentMonths, []);

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      // 1) DB에 upsert
      const syncRes = await fetch(
        `${API_BASE}/fde-api/jihee/gowith/sync?yearMonth=${selectedYM}`,
        { method: 'POST' },
      );
      if (!syncRes.ok) throw new Error(`sync HTTP ${syncRes.status}`);

      // 2) DB에서 조회
      const res = await fetch(`${API_BASE}/fde-api/jihee/gowith/expenses?yearMonth=${selectedYM}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: GowithExpense[] = data.expenses ?? [];

      setExpenses(list);
      setFetched(true);
      setFilters({});

      // localStorage에도 저장 (월별 내역 호환)
      const rows = list.map((e) => toRowData(e, selectedYM));
      const monthData: MonthData = {
        yearMonth: selectedYM,
        fileName: `고위드 API (${fmtYM(selectedYM)})`,
        uploadedAt: new Date().toLocaleString('ko-KR'),
        rows,
      };
      localStorage.setItem(DATA_KEY(selectedYM), JSON.stringify(monthData));

      const metaRaw = localStorage.getItem(META_KEY);
      const meta = metaRaw ? JSON.parse(metaRaw) : [];
      const filtered = meta.filter((m: { yearMonth: string }) => m.yearMonth !== selectedYM);
      const updated = [
        { id: `api_${Date.now()}`, name: `고위드 API (${fmtYM(selectedYM)})`, size: 0, yearMonth: selectedYM, uploadedAt: monthData.uploadedAt },
        ...filtered,
      ];
      localStorage.setItem(META_KEY, JSON.stringify(updated));
      setSaved(true);
    } catch (e) {
      setError(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ── 필터 적용 ────────────────────────────────────────────────
  const uniqueValues = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort();
    return {
      approvalStatus: uniq(expenses.map((e) => STATUS_LABEL[e.approvalStatus] ?? e.approvalStatus)),
      cardAlias: uniq(expenses.map((e) => e.cardAlias)),
      currency: uniq(expenses.map((e) => e.currency)),
    };
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filters.approvalStatus && (STATUS_LABEL[e.approvalStatus] ?? e.approvalStatus) !== filters.approvalStatus) return false;
      if (filters.cardAlias && e.cardAlias !== filters.cardAlias) return false;
      if (filters.currency && e.currency !== filters.currency) return false;
      return true;
    });
  }, [expenses, filters]);

  const summary = useMemo(() => {
    const total = filtered.reduce((a, e) => a + e.krwAmount, 0);
    const submitted = filtered.filter((e) => e.approvalStatus !== 'NOT_SUBMITTED').length;
    return { total, count: filtered.length, submitted };
  }, [filtered]);

  const setFilter = (key: FilterKey, val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  return (
    <div className={s.wrap}>
      {/* ── 조회 바 ── */}
      <div className={s.queryBar}>
        <div className={s.queryLeft}>
          <select
            className={s.ymSelect}
            value={selectedYM}
            onChange={(e) => { setSelectedYM(e.target.value); setFetched(false); setSaved(false); }}
          >
            {months.map((m) => (
              <option key={m} value={m}>{fmtYM(m)}</option>
            ))}
          </select>
          <button className={s.fetchBtn} onClick={handleFetch} disabled={loading}>
            {loading ? '조회 중...' : '조회'}
          </button>
          {saved && (
            <span className={s.savedBadge}>
              DB 저장 완료
            </span>
          )}
        </div>
        {fetched && (
          <div className={s.summaryBadges}>
            <span className={s.badge}>{summary.count.toLocaleString()}건</span>
            <span className={s.badge}>{fmt(summary.total)}원</span>
            <span className={s.badgeBlue}>{summary.submitted}건 제출/승인</span>
          </div>
        )}
      </div>

      {error && <div className={s.error}>{error}</div>}

      {/* ── 필터 바 ── */}
      {fetched && expenses.length > 0 && (
        <div className={s.filterBar}>
          {(
            [
              { key: 'approvalStatus' as FilterKey, label: '승인상태', opts: uniqueValues.approvalStatus },
              { key: 'cardAlias' as FilterKey, label: '카드별칭', opts: uniqueValues.cardAlias },
              { key: 'currency' as FilterKey, label: '통화', opts: uniqueValues.currency },
            ] as { key: FilterKey; label: string; opts: string[] }[]
          ).map(({ key, label, opts }) => (
            <div key={key} className={s.filterItem}>
              <span className={s.filterLabel}>{label}</span>
              <select
                className={s.filterSelect}
                value={filters[key] ?? ''}
                onChange={(e) => setFilter(key, e.target.value)}
              >
                <option value="">전체</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {Object.values(filters).some(Boolean) && (
            <button className={s.clearFilter} onClick={() => setFilters({})}>필터 초기화</button>
          )}
        </div>
      )}

      {/* ── 빈 상태 ── */}
      {!fetched && !loading && (
        <div className={s.emptyState}>
          <span className={s.emptyIcon} style={{ fontFamily: 'Tossface' }}>💳</span>
          <p className={s.emptyTitle}>월을 선택하고 조회 버튼을 누르세요</p>
          <p className={s.emptyDesc}>고위드 API에서 실시간으로 사용내역을 불러와 DB에 저장합니다.</p>
        </div>
      )}

      {loading && (
        <div className={s.emptyState}>
          <span className={s.emptyIcon} style={{ fontFamily: 'Tossface' }}>⏳</span>
          <p className={s.emptyTitle}>불러오는 중...</p>
        </div>
      )}

      {/* ── 테이블 ── */}
      {fetched && !loading && (
        <>
          <div className={s.tableInfo}>
            전체 {expenses.length}건 / 필터 {filtered.length}건
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>번호</th>
                  <th className={s.th}>사용일자</th>
                  <th className={s.th}>시간</th>
                  <th className={s.th}>카드별칭</th>
                  <th className={s.th}>카드번호</th>
                  <th className={s.th}>가맹점명</th>
                  <th className={`${s.th} ${s.thRight}`}>금액 (원)</th>
                  <th className={s.th}>제출자</th>
                  <th className={s.th}>용도</th>
                  <th className={s.th}>승인상태</th>
                  <th className={s.th}>전표처리 일자</th>
                  <th className={s.th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className={s.emptyRow}>필터 조건에 맞는 항목이 없습니다.</td>
                  </tr>
                ) : (
                  filtered.map((e, idx) => (
                    <tr key={e.expenseId} className={s.tr}>
                      <td className={`${s.td} ${s.tdCenter}`}>{idx + 1}</td>
                      <td className={`${s.td} ${s.tdNoWrap}`}>{fmtDate(e.expenseDate)}</td>
                      <td className={`${s.td} ${s.tdCenter}`}>{fmtTime(e.expenseTime)}</td>
                      <td className={s.td}>{e.cardAlias}</td>
                      <td className={`${s.td} ${s.tdMono}`}>{e.shortCardNumber}</td>
                      <td className={s.td}>{e.storeName}</td>
                      <td className={`${s.td} ${s.tdRight} ${e.currency !== 'KRW' ? s.foreignAmt : ''}`}>
                        {fmt(e.krwAmount)}
                        {e.currency !== 'KRW' && (
                          <span className={s.foreignTag}>{e.currency}</span>
                        )}
                      </td>
                      <td className={s.td}>{e.cardUserName}</td>
                      <td className={s.td}>{e.purpose?.name ?? ''}</td>
                      <td className={s.td}>
                        <span className={`${s.statusBadge} ${s[STATUS_CLASS[e.approvalStatus] ?? 'statusGray']}`}>
                          {STATUS_LABEL[e.approvalStatus] ?? e.approvalStatus}
                        </span>
                      </td>
                      <td className={`${s.td} ${s.tdNoWrap}`}>
                        {e.journalDate ?? ''}
                      </td>
                      <td className={`${s.td} ${s.tdMemo}`} title={e.memo ?? ''}>{e.memo ?? ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
