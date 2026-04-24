import { useCallback, useEffect, useMemo, useState } from 'react';
import s from './BranchMonthly.module.css';
import ExpenseForm from './ExpenseForm';
import { DeleteConfirmModal, RefundModal } from './ExpenseActions';
import {
  cancelRefund,
  deleteExpense,
  fetchExpenses,
  refundExpense,
  toggleReceiptConfirmed,
  type Branch,
  type Expense,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

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

      <div className={s.kpiGrid}>
        <Kpi label="등록 건수" value={`${kpi.count}건`} />
        <Kpi
          label={`${year}년${month ? ` ${month}월` : ''} 지출`}
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

      <div className={s.tableWrap}>
        {loading && <div className={s.loading}>불러오는 중...</div>}
        {!loading && expenses.length === 0 && (
          <div className={s.empty}>
            <p>등록된 지출이 없습니다.</p>
            <p className={s.emptyHint}>오른쪽 상단의 "+ 지출 등록"으로 시작하세요.</p>
          </div>
        )}
        {!loading && expenses.length > 0 && (
          <table className={s.table}>
            <thead>
              <tr>
                <th>수령</th>
                <th>주문일</th>
                <th>귀속</th>
                <th>계정</th>
                <th>품목</th>
                <th className={s.num}>단가</th>
                <th className={s.num}>수량</th>
                <th className={s.num}>배송</th>
                <th className={s.num}>총액</th>
                <th>상태</th>
                <th>작성자</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
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
  onToggleReceipt,
  onEdit,
  onRefund,
  onCancelRefund,
  onDelete,
}: {
  expense: Expense;
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

  return (
    <tr className={refunded ? s.rowRefunded : ''}>
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
          <span>{e.account_code_name ?? '-'}</span>
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
