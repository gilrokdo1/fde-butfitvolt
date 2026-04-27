import { useState, useMemo } from 'react';
import type { MonthData, RowData } from './types';
import s from './UsageHistory.module.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://fde.butfitvolt.click';
const DATA_KEY = (ym: string) => `gowith_data_${ym}`;
const META_KEY = 'gowith_uploaded_files';
const API_KEY_STORAGE = 'gowith_api_key';

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

// ── 승인상태 정의 ───────────────────────────────────────────────
const STATUS_TABS: { key: string; label: string }[] = [
  { key: '',                  label: '전체' },
  { key: 'NOT_SUBMITTED',     label: '미제출' },
  { key: 'SUBMITTED',         label: '제출됨' },
  { key: 'APPROVED',          label: '승인' },
  { key: 'REJECTED',          label: '반려' },
  { key: 'PARTIALLY_APPROVED', label: '부분승인' },
];

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

function fmt(n: number) { return n.toLocaleString('ko-KR'); }

function fmtDate(d: string) {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function fmtTime(t: string) {
  if (t.length < 4) return t;
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
}

function toRowData(exp: GowithExpense, ym: string): RowData {
  const parts = exp.shortCardNumber.split(' ');
  const rawCompany = parts[0] ?? '';
  const last4 = parts[1] ?? '';
  const cardCompanyMap: Record<string, string> = {
    '롯데': '롯데카드', '신한': '신한카드', 'BC': 'BC카드', '현대': '현대카드',
    '삼성': '삼성카드', '국민': '국민카드', '하나': '하나카드', '우리': '우리카드',
  };
  return {
    id: `${ym}_api_${exp.expenseId}`,
    usageDate: exp.expenseDate,
    cardCompany: cardCompanyMap[rawCompany] ?? rawCompany,
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

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

type FilterKey = 'cardAlias' | 'currency';

export default function UsageHistory() {
  const [selectedYM, setSelectedYM] = useState(getCurrentYearMonth);
  const [expenses, setExpenses] = useState<GowithExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeStatus, setActiveStatus] = useState('');
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});

  const [storedKey, setStoredKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(!localStorage.getItem(API_KEY_STORAGE));

  const months = useMemo(getRecentMonths, []);

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(API_KEY_STORAGE, k);
    setStoredKey(k);
    setKeyInput('');
    setEditingKey(false);
  };

  const handleFetch = async () => {
    if (!storedKey) { setError('먼저 API 키를 입력해주세요.'); return; }
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const headers = { 'X-Gowid-Key': storedKey };

      const syncRes = await fetch(
        `${API_BASE}/fde-api/jihee/gowith/sync?yearMonth=${selectedYM}`,
        { method: 'POST', headers },
      );
      if (!syncRes.ok) throw new Error(`sync HTTP ${syncRes.status}`);

      const res = await fetch(
        `${API_BASE}/fde-api/jihee/gowith/expenses?yearMonth=${selectedYM}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: GowithExpense[] = data.expenses ?? [];

      setExpenses(list);
      setFetched(true);
      setActiveStatus('');
      setFilters({});

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
      localStorage.setItem(META_KEY, JSON.stringify([
        { id: `api_${Date.now()}`, name: `고위드 API (${fmtYM(selectedYM)})`, size: 0, yearMonth: selectedYM, uploadedAt: monthData.uploadedAt },
        ...filtered,
      ]));
      setSaved(true);
    } catch (e) {
      setError(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ── 상태별 건수 ──────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': expenses.length };
    for (const e of expenses) {
      counts[e.approvalStatus] = (counts[e.approvalStatus] ?? 0) + 1;
    }
    return counts;
  }, [expenses]);

  // ── 탭 + 필터 적용 ───────────────────────────────────────────
  const uniqueValues = useMemo(() => {
    const src = activeStatus ? expenses.filter((e) => e.approvalStatus === activeStatus) : expenses;
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort();
    return {
      cardAlias: uniq(src.map((e) => e.cardAlias)),
      currency: uniq(src.map((e) => e.currency)),
    };
  }, [expenses, activeStatus]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (activeStatus && e.approvalStatus !== activeStatus) return false;
      if (filters.cardAlias && e.cardAlias !== filters.cardAlias) return false;
      if (filters.currency && e.currency !== filters.currency) return false;
      return true;
    });
  }, [expenses, activeStatus, filters]);

  const summary = useMemo(() => {
    const total = filtered.reduce((a, e) => a + e.krwAmount, 0);
    return { total, count: filtered.length };
  }, [filtered]);

  const setFilter = (key: FilterKey, val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const handleConvert = () => {
    alert('업로드 양식 변환 규칙을 확정 후 구현 예정입니다.');
  };

  // 실제 데이터에 존재하는 상태만 탭으로 표시 (전체 포함)
  const visibleTabs = STATUS_TABS.filter(
    (t) => t.key === '' || (statusCounts[t.key] ?? 0) > 0,
  );

  return (
    <div className={s.wrap}>
      {/* ── API 키 설정 ── */}
      {editingKey ? (
        <div className={s.apiKeyBar}>
          <span className={s.apiKeyLabel}>🔑 고위드 API 키</span>
          <input
            className={s.apiKeyInput}
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            placeholder="API 키를 입력하세요"
            autoFocus
          />
          <button className={s.apiKeySaveBtn} onClick={saveKey}>저장</button>
        </div>
      ) : (
        <div className={s.apiKeySet}>
          <span>API 키 설정됨</span>
          <button className={s.apiKeyChangeBtn} onClick={() => { setEditingKey(true); setKeyInput(''); }}>변경</button>
        </div>
      )}

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
          <button className={s.fetchBtn} onClick={handleFetch} disabled={loading || !storedKey}>
            {loading ? '조회 중...' : '조회'}
          </button>
          {saved && <span className={s.savedBadge}>DB 저장 완료</span>}
        </div>
        {fetched && (
          <div className={s.summaryBadges}>
            <span className={s.badge}>{summary.count.toLocaleString()}건</span>
            <span className={s.badge}>{fmt(summary.total)}원</span>
          </div>
        )}
      </div>

      {error && <div className={s.error}>{error}</div>}

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

      {fetched && !loading && (
        <>
          {/* ── 승인상태 탭 ── */}
          <div className={s.statusTabs}>
            {visibleTabs.map((tab) => {
              const count = tab.key === '' ? expenses.length : (statusCounts[tab.key] ?? 0);
              const isActive = activeStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  className={`${s.statusTab} ${isActive ? s.statusTabActive : ''}`}
                  onClick={() => { setActiveStatus(tab.key); setFilters({}); }}
                >
                  {tab.label}
                  <span className={`${s.statusTabCount} ${isActive ? s.statusTabActiveCount : ''}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── 승인 탭 액션바 ── */}
          {activeStatus === 'APPROVED' && (
            <div className={s.tabActionBar}>
              <button className={s.convertBtn} onClick={handleConvert}>
                업로드 양식으로 변환
              </button>
            </div>
          )}

          {/* ── 필터 바 (카드별칭, 통화) ── */}
          {expenses.length > 0 && (
            <div className={s.filterBar}>
              {(
                [
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

          <div className={s.tableInfo}>
            전체 {expenses.length}건 / 표시 {filtered.length}건
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
                    <td colSpan={12} className={s.emptyRow}>해당 항목이 없습니다.</td>
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
                      <td className={`${s.td} ${s.tdNoWrap}`}>{e.journalDate ?? ''}</td>
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
