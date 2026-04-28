import { useEffect, useState } from 'react';
import s from './ExpenseForm.module.css';
import {
  fetchReceiptDelays,
  toggleReceiptConfirmed,
  type ReceiptDelayItem,
} from './api';

interface Props {
  branchId: number;
  branchName: string;
  year: number;
  month: number;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * 지점 수령 지연 KPI 클릭 시 모달.
 * 지점 일상 업무라 "수령 확인" 액션 직접 가능 (조회+액션 혼합).
 */
export default function ReceiptDelayModal({
  branchId,
  branchName,
  year,
  month,
  onClose,
  onChanged,
}: Props) {
  const [items, setItems] = useState<ReceiptDelayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  function reload() {
    setLoading(true);
    fetchReceiptDelays(branchId, year, month)
      .then((res) => setItems(res.items))
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '수령 지연 조회 실패'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, year, month]);

  async function handleConfirm(id: number) {
    setConfirmingId(id);
    setError(null);
    try {
      await toggleReceiptConfirmed(id, true);
      // 즉시 목록에서 제거 (낙관적)
      setItems((prev) => prev.filter((it) => it.id !== id));
      onChanged();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '수령 확인 실패'));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 800 }}
      >
        <header className={s.modalHeader}>
          <h3>
            <span style={{ fontFamily: 'Tossface' }}>&#x1F4E6;</span>{' '}
            수령 지연 · {branchName} · {year}-{String(month).padStart(2, '0')}
          </h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {loading && <p style={{ textAlign: 'center', color: '#6B7280' }}>불러오는 중...</p>}

          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#059669' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                ✓ 수령 지연 건이 없습니다
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
                7일(장기 배송 14일) 이상 미수령 건이 모두 처리됐습니다.
              </p>
            </div>
          )}

          {!loading && items.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                주문 후 임계일(7일/14일) 이상 수령확인 안 된 {items.length}건. 받으셨으면 ✓ 버튼으로 즉시 확인 처리하세요.
              </p>

              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>주문일</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>경과</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>품목</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>계정</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>총액</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>작성자</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const overdue = it.days_passed - it.threshold;
                    return (
                      <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: 8 }}>{it.order_date}</td>
                        <td style={{ padding: 8 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: overdue >= 7 ? '#FEE2E2' : '#FEF3C7',
                              color: overdue >= 7 ? '#991B1B' : '#B45309',
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {it.days_passed}일째
                            {it.is_long_delivery && (
                              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>
                                (장기 14)
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: 8, fontWeight: 500 }}>
                          {it.item_name}
                          {it.receipt_url && (
                            <a
                              href={it.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ marginLeft: 4, fontSize: 10, color: '#5B5FC7' }}
                            >
                              ↗
                            </a>
                          )}
                        </td>
                        <td style={{ padding: 8, color: '#6B7280', fontSize: 11 }}>
                          {it.account_code_name ?? '-'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {(it.total_amount - it.refunded_amount).toLocaleString()}
                        </td>
                        <td style={{ padding: 8 }}>{it.created_by_name ?? '-'}</td>
                        <td style={{ padding: 8 }}>
                          <button
                            onClick={() => handleConfirm(it.id)}
                            disabled={confirmingId === it.id}
                            style={{
                              padding: '4px 10px',
                              background: '#10B981',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: confirmingId === it.id ? 'wait' : 'pointer',
                              opacity: confirmingId === it.id ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                            title="수령 확인 처리"
                          >
                            {confirmingId === it.id ? '...' : '✓ 확인'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
