import { useCallback, useEffect, useMemo, useState } from 'react';
import s from './BranchMonthly.module.css';
import f from './FilterBar.module.css';
import ExpenseForm from './ExpenseForm';
import { DeleteConfirmModal, RefundModal } from './ExpenseActions';
import BudgetDashboard from './BudgetDashboard';
import CategoryFilter from './CategoryFilter';
import MultiSelectFilter from './MultiSelectFilter';
import {
  cancelRefund,
  deleteExpense,
  fetchCategories,
  fetchExpenses,
  refundExpense,
  toggleReceiptConfirmed,
  type AccountCategory,
  type Branch,
  type Expense,
  type ExpenseStatus,
} from './api';

interface Props {
  branch: Branch;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; expense: Expense }
  | { kind: 'refund'; expense: Expense }
  | { kind: 'delete'; expense: Expense };

const CURRENT_YEAR = new Date().getFullYear();

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

function daysSince(dateStr: string): number {
  const order = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - order.getTime()) / 86400000);
}

export default function BranchMonthly({ branch }: Props) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  // 필터 (null = 전체)
  const [accountFilter, setAccountFilter] = useState<Set<number> | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<ExpenseStatus> | null>(null);
  const [receiptFilter, setReceiptFilter] = useState<Set<'confirmed' | 'pending' | 'delayed'> | null>(null);
  const [writerFilter, setWriterFilter] = useState<Set<string> | null>(null);
  const [sourceFilter, setSourceFilter] = useState<Set<'migrated' | 'manual'> | null>(null);

  // 정렬 (확장 가능한 구조)
  type SortKey = 'order_date' | 'accounting' | 'total_amount';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'order_date',
    dir: 'desc',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchExpenses(branch.id, {
        year,
        month: month ?? undefined,
      });
      setExpenses(list);
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '목록 로드 실패'));
    } finally {
      setLoading(false);
    }
  }, [branch.id, year, month]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 카테고리 목록 (필터에서 대카·소카 트리 + 행 툴팁용)
  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => undefined);
  }, []);

  // 소카 id → 대카 이름 매핑 (행 툴팁용)
  const categoryNameByCodeId = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories) {
      for (const ac of c.codes) map.set(ac.id, c.name);
    }
    return map;
  }, [categories]);

  // 작성자 옵션 (현재 로딩된 데이터 기준)
  const writerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) if (e.created_by_name) set.add(e.created_by_name);
    return Array.from(set).sort().map((name) => ({ value: name, label: name }));
  }, [expenses]);

  // 필터 + 정렬 적용
  const visibleExpenses = useMemo(() => {
    const filtered = expenses.filter((e) => {
      if (accountFilter && !accountFilter.has(e.account_code_id)) return false;
      if (statusFilter && !statusFilter.has(e.status)) return false;
      if (receiptFilter) {
        const threshold = e.is_long_delivery ? 14 : 7;
        const delayed = !e.receipt_confirmed && !e.is_migrated && daysSince(e.order_date) >= threshold;
        const tag: 'confirmed' | 'pending' | 'delayed' = e.receipt_confirmed
          ? 'confirmed'
          : delayed ? 'delayed' : 'pending';
        if (!receiptFilter.has(tag)) return false;
      }
      if (writerFilter && (!e.created_by_name || !writerFilter.has(e.created_by_name))) return false;
      if (sourceFilter) {
        const tag: 'migrated' | 'manual' = e.is_migrated ? 'migrated' : 'manual';
        if (!sourceFilter.has(tag)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'order_date') {
        const cmp = a.order_date.localeCompare(b.order_date);
        return cmp !== 0 ? cmp * dir : (a.id - b.id) * dir;
      }
      if (sort.key === 'accounting') {
        const av = a.accounting_year * 100 + a.accounting_month;
        const bv = b.accounting_year * 100 + b.accounting_month;
        return av !== bv ? (av - bv) * dir : (a.id - b.id) * dir;
      }
      if (sort.key === 'total_amount') {
        return (a.total_amount - b.total_amount) * dir;
      }
      return 0;
    });

    return sorted;
  }, [expenses, accountFilter, statusFilter, receiptFilter, writerFilter, sourceFilter, sort]);

  function toggleSort(key: 'order_date' | 'accounting' | 'total_amount') {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    );
  }

  const hasActiveFilter =
    accountFilter !== null ||
    statusFilter !== null ||
    receiptFilter !== null ||
    writerFilter !== null ||
    sourceFilter !== null;

  function resetFilters() {
    setAccountFilter(null);
    setStatusFilter(null);
    setReceiptFilter(null);
    setWriterFilter(null);
    setSourceFilter(null);
  }

  const kpi = useMemo(() => {
    const active = expenses.filter((e) => !e.is_pending);
    const totalSpend = active.reduce((sum, e) => sum + (e.total_amount - e.refunded_amount), 0);
    const pendingCount = expenses.filter((e) => e.is_pending).length;
    const pendingSum = expenses
      .filter((e) => e.is_pending)
      .reduce((sum, e) => sum + (e.total_amount - e.refunded_amount), 0);
    const unconfirmed = expenses.filter((e) => {
      if (e.receipt_confirmed || e.is_migrated) return false;
      const threshold = e.is_long_delivery ? 14 : 7;
      return daysSince(e.order_date) >= threshold;
    }).length;
    return {
      count: expenses.length,
      totalSpend,
      pendingCount,
      pendingSum,
      unconfirmed,
    };
  }, [expenses]);

  async function handleToggleReceipt(exp: Expense) {
    try {
      await toggleReceiptConfirmed(exp.id, !exp.receipt_confirmed);
      await reload();
    } catch {
      setError('수령 확인 변경 실패');
    }
  }

  async function handleCancelRefund(exp: Expense) {
    if (!confirm(`${exp.item_name} 환불을 취소할까요? (completed로 되돌립니다)`)) return;
    try {
      await cancelRefund(exp.id);
      await reload();
    } catch {
      setError('환불 취소 실패');
    }
  }

  return (
    <div>
      <div className={s.filters}>
        <div className={s.yearRow}>
          <label>
            <span>연도</span>
            <input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value) || CURRENT_YEAR)}
            />
          </label>
          <div className={s.monthChips}>
            <button
              className={`${s.chip} ${month === null ? s.chipActive : ''}`}
              onClick={() => setMonth(null)}
            >
              전체
            </button>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                className={`${s.chip} ${month === m ? s.chipActive : ''}`}
                onClick={() => setMonth(m)}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <button className={s.primaryBtn} onClick={() => setModal({ kind: 'create' })}>
          + 지출 등록
        </button>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {month !== null ? (
        /* 특정 월 선택 시: 예산 인지 대시보드 표시 */
        <BudgetDashboard branch={branch} year={year} month={month} />
      ) : (
        /* "전체" 선택 시: 지출 요약 KPI만 */
        <div className={s.kpiGrid}>
          <Kpi label="등록 건수" value={`${kpi.count}건`} />
          <Kpi
            label={`${year}년 전체 지출`}
            value={formatKRW(kpi.totalSpend)}
            hint="환불 차감 후"
          />
          <Kpi
            label="미정 대기"
            value={kpi.pendingCount > 0 ? `${kpi.pendingCount}건` : '-'}
            hint={kpi.pendingCount > 0 ? formatKRW(kpi.pendingSum) : '없음'}
            tone={kpi.pendingCount > 0 ? 'warning' : undefined}
          />
          <Kpi
            label="수령 지연"
            value={kpi.unconfirmed > 0 ? `${kpi.unconfirmed}건` : '-'}
            hint={kpi.unconfirmed > 0 ? '7일 이상 미확인' : '없음'}
            tone={kpi.unconfirmed > 0 ? 'danger' : undefined}
          />
        </div>
      )}

      <h3 className={s.sectionTitle}>지출 내역</h3>

      {/* 필터 바 */}
      <div className={f.bar}>
        <span className={f.barLabel}>필터</span>
        <CategoryFilter
          categories={categories}
          selected={accountFilter}
          onChange={setAccountFilter}
        />
        <MultiSelectFilter
          label="상태"
          options={[
            { value: 'completed' as ExpenseStatus, label: '정상' },
            { value: 'partially_refunded' as ExpenseStatus, label: '부분환불' },
            { value: 'fully_refunded' as ExpenseStatus, label: '전액환불' },
          ]}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <MultiSelectFilter
          label="수령"
          options={[
            { value: 'confirmed' as const, label: '확인됨' },
            { value: 'pending' as const, label: '미확인' },
            { value: 'delayed' as const, label: '지연 (주의)' },
          ]}
          selected={receiptFilter}
          onChange={setReceiptFilter}
        />
        <MultiSelectFilter
          label="작성자"
          options={writerOptions}
          selected={writerFilter}
          onChange={setWriterFilter}
        />
        <MultiSelectFilter
          label="유형"
          options={[
            { value: 'manual' as const, label: '신규 등록' },
            { value: 'migrated' as const, label: '이관 데이터' },
          ]}
          selected={sourceFilter}
          onChange={setSourceFilter}
        />
        <button
          type="button"
          className={f.resetBtn}
          onClick={resetFilters}
          disabled={!hasActiveFilter}
        >
          필터 초기화
        </button>
      </div>

      <div className={s.tableWrap}>
        {loading && <div className={s.loading}>불러오는 중...</div>}
        {!loading && expenses.length === 0 && (
          <div className={s.empty}>
            <p>등록된 지출이 없습니다.</p>
            <p className={s.emptyHint}>오른쪽 상단의 "+ 지출 등록"으로 시작하세요.</p>
          </div>
        )}
        {!loading && expenses.length > 0 && visibleExpenses.length === 0 && (
          <div className={s.empty}>
            <p>필터에 맞는 지출이 없습니다.</p>
            <p className={s.emptyHint}>"필터 초기화"로 전체 보기.</p>
          </div>
        )}
        {!loading && visibleExpenses.length > 0 && (
          <table className={s.table}>
            <thead>
              <tr>
                <th>수령</th>
                <SortableHeader
                  label="주문일"
                  active={sort.key === 'order_date'}
                  dir={sort.dir}
                  onClick={() => toggleSort('order_date')}
                />
                <SortableHeader
                  label="귀속"
                  active={sort.key === 'accounting'}
                  dir={sort.dir}
                  onClick={() => toggleSort('accounting')}
                />
                <th>계정</th>
                <th>품목</th>
                <th className={s.num}>단가</th>
                <th className={s.num}>수량</th>
                <th className={s.num}>배송</th>
                <SortableHeader
                  label="총액"
                  active={sort.key === 'total_amount'}
                  dir={sort.dir}
                  onClick={() => toggleSort('total_amount')}
                  align="right"
                />
                <th>상태</th>
                <th>작성자</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  parentCategoryName={categoryNameByCodeId.get(e.account_code_id) ?? null}
                  onToggleReceipt={handleToggleReceipt}
                  onEdit={() => setModal({ kind: 'edit', expense: e })}
                  onRefund={() => setModal({ kind: 'refund', expense: e })}
                  onCancelRefund={() => handleCancelRefund(e)}
                  onDelete={() => setModal({ kind: 'delete', expense: e })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal.kind === 'create' || modal.kind === 'edit') && (
        <ExpenseForm
          branchId={branch.id}
          branchName={branch.name}
          existing={modal.kind === 'edit' ? modal.expense : null}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={reload}
        />
      )}
      {modal.kind === 'refund' && (
        <RefundModal
          expense={modal.expense}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (amount, reason) => {
            await refundExpense(modal.expense.id, amount, reason);
            await reload();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteConfirmModal
          expense={modal.expense}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (reason) => {
            await deleteExpense(modal.expense.id, reason);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning' | 'danger';
}) {
  return (
    <div className={`${s.kpi} ${tone === 'warning' ? s.kpiWarning : ''} ${tone === 'danger' ? s.kpiDanger : ''}`}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  );
}

function ExpenseRow({
  expense: e,
  parentCategoryName,
  onToggleReceipt,
  onEdit,
  onRefund,
  onCancelRefund,
  onDelete,
}: {
  expense: Expense;
  parentCategoryName: string | null;
  onToggleReceipt: (e: Expense) => void;
  onEdit: () => void;
  onRefund: () => void;
  onCancelRefund: () => void;
  onDelete: () => void;
}) {
  const receiptDelayed = useMemo(() => {
    if (e.receipt_confirmed || e.is_migrated) return false;
    const threshold = e.is_long_delivery ? 14 : 7;
    return daysSince(e.order_date) >= threshold;
  }, [e]);

  const refunded = e.status !== 'completed';
  const accountTooltip = parentCategoryName && e.account_code_name
    ? `${parentCategoryName} › ${e.account_code_name}`
    : undefined;

  return (
    <tr className={refunded ? s.rowRefunded : ''} title={accountTooltip}>
      <td>
        <button
          className={`${s.receiptBtn} ${e.receipt_confirmed ? s.receiptOn : ''}`}
          onClick={() => onToggleReceipt(e)}
          title={e.receipt_confirmed ? '수령 확인됨' : '수령 확인'}
        >
          {e.receipt_confirmed ? '✓' : '·'}
        </button>
        {receiptDelayed && <span className={s.delayBadge} title="수령 지연">!</span>}
      </td>
      <td>{e.order_date}</td>
      <td>
        {e.accounting_year}-{String(e.accounting_month).padStart(2, '0')}
      </td>
      <td>
        {e.is_pending ? (
          <span className={s.pendingBadge} title={e.pending_reason ?? ''}>🤔 미정</span>
        ) : (
          <span title={accountTooltip}>{e.account_code_name ?? '-'}</span>
        )}
      </td>
      <td className={s.itemName}>
        {e.item_name}
        {e.receipt_url && (
          <a href={e.receipt_url} target="_blank" rel="noreferrer" className={s.linkIcon}>
            ↗
          </a>
        )}
      </td>
      <td className={s.num}>{e.unit_price.toLocaleString()}</td>
      <td className={s.num}>{e.quantity}</td>
      <td className={s.num}>{e.shipping_fee ? e.shipping_fee.toLocaleString() : '-'}</td>
      <td className={s.num}>
        <strong>{e.total_amount.toLocaleString()}</strong>
        {refunded && e.refunded_amount > 0 && (
          <div className={s.refundedAmount}>−{e.refunded_amount.toLocaleString()}</div>
        )}
      </td>
      <td>
        {e.status === 'completed' && <span className={s.statusOk}>정상</span>}
        {e.status === 'partially_refunded' && <span className={s.statusPartial}>부분환불</span>}
        {e.status === 'fully_refunded' && <span className={s.statusFull}>전액환불</span>}
        {e.is_migrated && <span className={s.migratedBadge}>이관</span>}
      </td>
      <td>{e.created_by_name ?? '-'}</td>
      <td>
        <div className={s.actions}>
          <button onClick={onEdit}>수정</button>
          {e.status === 'completed' ? (
            <button onClick={onRefund}>환불</button>
          ) : (
            <button onClick={onCancelRefund}>환불취소</button>
          )}
          <button className={s.dangerLink} onClick={onDelete}>
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'right';
}) {
  const icon = active ? (dir === 'asc' ? '↑' : '↓') : '⇅';
  return (
    <th
      className={`${f.sortHeader} ${align === 'right' ? s.num : ''}`}
      onClick={onClick}
      title={active ? `${label} ${dir === 'asc' ? '오름차순' : '내림차순'}` : `${label} 정렬`}
    >
      {label}
      <span className={`${f.sortIcon} ${active ? f.sortIconActive : ''}`}>{icon}</span>
    </th>
  );
}
