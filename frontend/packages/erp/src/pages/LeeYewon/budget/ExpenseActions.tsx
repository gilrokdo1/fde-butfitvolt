import { useState } from 'react';
import s from './ExpenseForm.module.css';
import type { Expense } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// 환불 모달
// ─────────────────────────────────────────────────────────────────────────────

interface RefundProps {
  expense: Expense;
  onClose: () => void;
  onConfirm: (amount: number, reason: string) => Promise<void>;
}

export function RefundModal({ expense, onClose, onConfirm }: RefundProps) {
  const [amount, setAmount] = useState(String(expense.total_amount));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      setError('환불 금액을 올바르게 입력하세요');
      return;
    }
    if (amt > expense.total_amount) {
      setError('환불 금액이 총액을 초과할 수 없습니다');
      return;
    }
    if (!reason.trim()) {
      setError('환불 사유는 필수입니다');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(amt, reason.trim());
      onClose();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '환불 처리 실패'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <header className={s.modalHeader}>
          <h3>환불 처리</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          <div className={s.totalLine}>
            <span>{expense.item_name}</span>
            <strong>{expense.total_amount.toLocaleString()}원</strong>
          </div>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>환불 금액 *</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                max={expense.total_amount}
              />
            </label>
          </div>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>환불 사유 *</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 불량 수령, 오주문 등"
              />
            </label>
          </div>
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className={s.saveBtn} onClick={submit} disabled={saving}>
            {saving ? '처리 중...' : '환불 확정'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 삭제 확인 모달
// ─────────────────────────────────────────────────────────────────────────────

interface DeleteProps {
  expense: Expense;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function DeleteConfirmModal({ expense, onClose, onConfirm }: DeleteProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) {
      setError('삭제 사유는 필수입니다');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '삭제 실패'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <header className={s.modalHeader}>
          <h3>지출 삭제</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          <div className={s.totalLine}>
            <span>{expense.item_name}</span>
            <strong>{expense.total_amount.toLocaleString()}원</strong>
          </div>

          <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
            소프트 삭제됩니다. 감사 로그에 기록되며 SGM 이상 권한자는 복원할 수 있습니다.
          </p>

          <div className={s.row}>
            <label className={s.fullWidth}>
              <span>삭제 사유 *</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 중복 등록, 취소된 주문 등"
              />
            </label>
          </div>
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            className={s.saveBtn}
            style={{ background: '#DC2626' }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? '삭제 중...' : '삭제'}
          </button>
        </footer>
      </div>
    </div>
  );
}
