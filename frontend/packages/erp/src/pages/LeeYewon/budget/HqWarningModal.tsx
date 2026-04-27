import { useEffect, useState } from 'react';
import s from './ExpenseForm.module.css';
import { fetchHqWarnings, type HqWarningResponse } from './api';

interface Props {
  year: number;
  month: number;
  onClose: () => void;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 본사 KPI '주의 지점' 클릭 시 — 90%+ 계정을 지점별로 그룹화. 조회 전용. */
export default function HqWarningModal({ year, month, onClose }: Props) {
  const [data, setData] = useState<HqWarningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHqWarnings(year, month)
      .then(setData)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '주의 지점 조회 실패'));
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <header className={s.modalHeader}>
          <h3>
            <span style={{ fontFamily: 'Tossface' }}>&#x26A0;&#xFE0F;</span>{' '}
            주의 지점 · {year}-{String(month).padStart(2, '0')}
          </h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {loading && <p style={{ textAlign: 'center', color: '#6B7280' }}>불러오는 중...</p>}

          {!loading && data && data.groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#059669' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                ✓ 90% 이상 소진된 계정이 없습니다
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
                활성 지점 모두 정상 범위.
              </p>
            </div>
          )}

          {!loading && data && data.groups.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                90% 이상 소진된 계정이 있는 지점입니다. 빨간색은 100%+ 초과, 주황색은 90~100%.
              </p>

              {data.groups.map((g) => (
                <div
                  key={g.branch_id}
                  style={{
                    border: g.danger_count > 0 ? '1px solid #FECACA' : '1px solid #FED7AA',
                    background: g.danger_count > 0 ? '#FEF2F2' : '#FFFBEB',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      background: g.danger_count > 0 ? '#FEE2E2' : '#FED7AA',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong style={{ color: g.danger_count > 0 ? '#991B1B' : '#9A3412', fontSize: 13 }}>
                      🏢 {g.branch_name}
                    </strong>
                    <span style={{ fontSize: 12, color: g.danger_count > 0 ? '#991B1B' : '#9A3412' }}>
                      {g.danger_count > 0 && (
                        <span style={{ marginRight: 8 }}>
                          🔴 초과 <strong>{g.danger_count}</strong>
                        </span>
                      )}
                      {g.warn_count > 0 && (
                        <span>
                          🟠 주의 <strong>{g.warn_count}</strong>
                        </span>
                      )}
                    </span>
                  </div>

                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 10, color: '#6B7280', background: 'white' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>계정</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>월 지출</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>월 예산</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>소진율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => (
                        <tr key={it.account_code_id} style={{ borderTop: '1px solid #F3F4F6', background: 'white' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontWeight: 500 }}>{it.account_name}</span>
                            <span style={{ marginLeft: 6, fontSize: 10, color: '#9CA3AF' }}>
                              · {it.category_name}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {it.month_spend.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
                            {it.month_budget.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                background: it.tone === 'danger' ? '#FEE2E2' : '#FED7AA',
                                color: it.tone === 'danger' ? '#991B1B' : '#9A3412',
                              }}
                            >
                              {pct(it.month_ratio)}
                              {it.tone === 'danger' && ' 초과'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <p
                style={{
                  margin: 0,
                  padding: '8px 12px',
                  background: '#EEF2FF',
                  color: '#4338CA',
                  fontSize: 11,
                  borderRadius: 6,
                  fontStyle: 'italic',
                }}
              >
                ℹ️ 본사는 조회 전용. 추경 검토는 Flex에서, 지출 조정은 지점 모드에서 진행하세요.
              </p>
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
