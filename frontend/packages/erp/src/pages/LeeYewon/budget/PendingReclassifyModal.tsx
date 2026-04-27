import { useEffect, useMemo, useState } from 'react';
import s from './ExpenseForm.module.css';
import {
  fetchCategories,
  fetchPendingExpenses,
  reclassifyExpense,
  type AccountCategory,
  type Branch,
  type PendingExpense,
} from './api';

interface Props {
  branch: Branch;
  onClose: () => void;
  onChanged: () => void;
}

export default function PendingReclassifyModal({ branch, onClose, onChanged }: Props) {
  const [pending, setPending] = useState<PendingExpense[]>([]);
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // expense_id → 선택된 account_code_id
  const [selections, setSelections] = useState<Record<number, number | ''>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchPendingExpenses(branch.id), fetchCategories()])
      .then(([list, cats]) => {
        setPending(list);
        setCategories(cats);
      })
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '로드 실패'));
      })
      .finally(() => setLoading(false));
  }, [branch.id]);

  const formalCategories = useMemo(
    () => categories.filter((c) => !c.is_pending),
    [categories],
  );

  async function handleConfirm(expenseId: number) {
    const target = selections[expenseId];
    if (!target) {
      setError('카테고리를 먼저 선택하세요');
      return;
    }
    setSavingId(expenseId);
    setError(null);
    try {
      await reclassifyExpense(expenseId, Number(target));
      // 목록에서 제거
      setPending((prev) => prev.filter((p) => p.id !== expenseId));
      setSelections((prev) => {
        const next = { ...prev };
        delete next[expenseId];
        return next;
      });
      onChanged();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '재분류 실패'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760 }}
      >
        <header className={s.modalHeader}>
          <h3>미정 카테고리 재분류 · {branch.name}</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {loading && <p style={{ textAlign: 'center', color: '#6B7280' }}>불러오는 중...</p>}

          {!loading && pending.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#059669' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>✓ 모든 미정 항목이 분류됐습니다</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
                미정으로 등록된 지출이 없습니다.
              </p>
            </div>
          )}

          {!loading && pending.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                {pending.length}건 대기 중. 각 항목마다 정식 카테고리를 선택하고 확정하세요.
              </p>

              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>주문일</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>품목</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>총액</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>사유/비고</th>
                    <th style={{ padding: 8, textAlign: 'left', minWidth: 200 }}>분류 →</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: 8 }}>{p.order_date}</td>
                      <td style={{ padding: 8, fontWeight: 500 }}>
                        {p.item_name}
                        {p.receipt_url && (
                          <a
                            href={p.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ marginLeft: 4, fontSize: 10, color: '#5B5FC7' }}
                          >
                            ↗
                          </a>
                        )}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {p.total_amount.toLocaleString()}원
                      </td>
                      <td style={{ padding: 8, color: '#6B7280', fontSize: 11 }}>
                        {p.pending_reason || p.note || '-'}
                      </td>
                      <td style={{ padding: 8 }}>
                        <select
                          style={{
                            width: '100%',
                            padding: '4px 8px',
                            border: '1px solid #D1D5DB',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                          value={selections[p.id] ?? ''}
                          onChange={(e) =>
                            setSelections((prev) => ({
                              ...prev,
                              [p.id]: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                        >
                          <option value="">(선택)</option>
                          {formalCategories.map((c) => (
                            <optgroup key={c.id} label={c.name}>
                              {c.codes.map((ac) => (
                                <option key={ac.id} value={ac.id}>
                                  {ac.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>
                        <button
                          onClick={() => handleConfirm(p.id)}
                          disabled={!selections[p.id] || savingId === p.id}
                          style={{
                            padding: '4px 10px',
                            background: '#5B5FC7',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                            opacity: !selections[p.id] || savingId === p.id ? 0.5 : 1,
                          }}
                        >
                          {savingId === p.id ? '...' : '확정'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>
  );
}
