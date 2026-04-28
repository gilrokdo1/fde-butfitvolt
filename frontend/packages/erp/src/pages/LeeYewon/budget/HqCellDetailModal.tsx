import { useEffect, useMemo, useState } from 'react';
import s from './ExpenseForm.module.css';
import { fetchExpenses, type Expense } from './api';

interface Props {
  branchId: number;
  branchName: string;
  /** 단일 셀 모드: 특정 소카테고리만 본다. null/undefined = 지점 전체. */
  accountCodeId?: number | null;
  accountName?: string | null;
  /** 합계 표시용 */
  monthBudget?: number;
  monthSpend?: number;
  monthRatio?: number;
  year: number;
  month: number;
  onClose: () => void;
}

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * 본사 뷰에서 셀(지점+계정) 또는 행(지점) 클릭 시 띄우는 조회 전용 모달.
 * 수정·환불·삭제 같은 액션은 의도적으로 제거 — 본사는 보고/파악, 지점은 액션.
 */
export default function HqCellDetailModal({
  branchId,
  branchName,
  accountCodeId,
  accountName,
  monthBudget,
  monthSpend,
  monthRatio,
  year,
  month,
  onClose,
}: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchExpenses(branchId, {
      year,
      month,
      account_code_id: accountCodeId ?? undefined,
      include_pending: false,  // 미정은 셀 집계에서 제외돼있으므로 일관성 유지
    })
      .then(setExpenses)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '지출 조회 실패'));
      })
      .finally(() => setLoading(false));
  }, [branchId, accountCodeId, year, month]);

  // 작성자별 합계 (위쪽 요약에 노출)
  const writerSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const e of expenses) {
      const name = e.created_by_name ?? '(미상)';
      const cur = map.get(name) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += e.total_amount - e.refunded_amount;
      map.set(name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const totalSpend = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.total_amount - e.refunded_amount), 0),
    [expenses],
  );

  const title = accountName
    ? `${branchName} · ${accountName}`
    : `${branchName} (전체 계정)`;

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760 }}
      >
        <header className={s.modalHeader}>
          <h3>{title} · {year}-{String(month).padStart(2, '0')}</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {/* 상단 요약 — 예산 있으면 진행바 패턴, 없으면 단순 합계 */}
          {(monthBudget !== undefined && monthBudget > 0) ? (() => {
            const spend = monthSpend ?? totalSpend;
            const ratio = monthRatio ?? (spend / monthBudget);
            const overshoot = spend - monthBudget;
            const isDanger = ratio >= 1;
            const isWarn = ratio >= 0.9 && ratio < 1;
            const barCap = 1.3;
            const fillPct = Math.min(ratio, barCap) / barCap * 100;
            const budgetMarkPct = (1 / barCap) * 100;
            const fillColor = isDanger ? '#DC2626' : isWarn ? '#F59E0B' : '#5B5FC7';
            return (
              <div style={{
                padding: 12,
                background: '#F9FAFB',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>월 소진 현황</span>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: isDanger ? '#FEE2E2' : isWarn ? '#FED7AA' : '#EEF2FF',
                      color: isDanger ? '#991B1B' : isWarn ? '#9A3412' : '#4338CA',
                    }}
                  >
                    {pct(ratio)}
                  </span>
                </div>
                {/* 진행바 */}
                <div style={{
                  position: 'relative',
                  height: 10,
                  background: '#E5E7EB',
                  borderRadius: 5,
                  overflow: 'visible',
                }}>
                  <div style={{
                    width: `${fillPct}%`,
                    height: '100%',
                    background: fillColor,
                    borderRadius: 5,
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: -2,
                    bottom: -2,
                    left: `${budgetMarkPct}%`,
                    width: 2,
                    background: '#1F2937',
                    borderRadius: 1,
                  }} title="예산선 (100%)" />
                </div>
                {/* 예산·지출·초과 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ color: '#6B7280' }}>
                    예산 <strong style={{ color: '#374151' }}>{formatKRW(monthBudget)}</strong>
                  </span>
                  <span style={{ color: '#6B7280' }}>
                    지출 <strong style={{ color: isDanger ? '#991B1B' : '#374151' }}>{formatKRW(spend)}</strong>
                  </span>
                  <span style={{ color: overshoot > 0 ? '#991B1B' : '#059669', fontWeight: 600 }}>
                    {overshoot > 0
                      ? `초과 +${overshoot.toLocaleString()}원`
                      : `잔여 ${(-overshoot).toLocaleString()}원`}
                  </span>
                </div>
              </div>
            );
          })() : (
            <div className={s.totalLine}>
              <span>월 지출 합계</span>
              <strong>{formatKRW(totalSpend)}</strong>
            </div>
          )}

          {/* 작성자 분포 */}
          {writerSummary.length > 1 && (
            <div style={{ padding: 10, background: '#F9FAFB', borderRadius: 6 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
                작성자별 분포
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                {writerSummary.map((w) => (
                  <span
                    key={w.name}
                    style={{
                      padding: '3px 8px',
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 999,
                      color: '#374151',
                    }}
                  >
                    {w.name} <strong>{w.count}건</strong> · {w.total.toLocaleString()}원
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 지출 목록 */}
          {loading && (
            <p style={{ textAlign: 'center', color: '#6B7280', padding: 16 }}>불러오는 중...</p>
          )}

          {!loading && expenses.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#6B7280', fontSize: 13 }}>
              <p style={{ margin: 0 }}>해당 조건의 지출이 없습니다.</p>
            </div>
          )}

          {!loading && expenses.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>주문일</th>
                    {!accountCodeId && <th style={{ padding: 8, textAlign: 'left' }}>계정</th>}
                    <th style={{ padding: 8, textAlign: 'left' }}>품목</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>총액</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>작성자</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: 8 }}>{e.order_date}</td>
                      {!accountCodeId && (
                        <td style={{ padding: 8, fontSize: 11, color: '#6B7280' }}>
                          {e.account_code_name ?? '-'}
                        </td>
                      )}
                      <td style={{ padding: 8, fontWeight: 500 }}>
                        {e.item_name}
                        {e.receipt_url && (
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ marginLeft: 4, fontSize: 10, color: '#5B5FC7' }}
                          >
                            ↗
                          </a>
                        )}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {(e.total_amount - e.refunded_amount).toLocaleString()}
                        {e.refunded_amount > 0 && (
                          <span style={{ color: '#9CA3AF', fontSize: 10, marginLeft: 4 }}>
                            (환불 -{e.refunded_amount.toLocaleString()})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>{e.created_by_name ?? '-'}</td>
                      <td style={{ padding: 8 }}>
                        {e.status === 'completed' && <span style={{ color: '#065F46' }}>정상</span>}
                        {e.status === 'partially_refunded' && <span style={{ color: '#B45309' }}>부분환불</span>}
                        {e.status === 'fully_refunded' && <span style={{ color: '#991B1B' }}>전액환불</span>}
                        {e.is_migrated && (
                          <span style={{
                            marginLeft: 4, padding: '1px 5px', background: '#E0E7FF',
                            color: '#3730A3', fontSize: 9, borderRadius: 3,
                          }}>
                            이관
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{
            margin: 0,
            padding: '8px 12px',
            background: '#EEF2FF',
            color: '#4338CA',
            fontSize: 11,
            borderRadius: 6,
            fontStyle: 'italic',
          }}>
            ℹ️ 본사 뷰는 조회 전용입니다. 수정·환불·삭제는 [지점] 모드에서 진행하세요.
          </p>
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>
  );
}
