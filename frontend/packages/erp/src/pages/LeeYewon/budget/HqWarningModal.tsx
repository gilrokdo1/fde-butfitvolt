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
                        <th style={{ padding: '6px 10px', textAlign: 'left', width: '28%' }}>계정</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>소진 현황</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', width: 90 }}>소진율</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', width: 110 }}>초과/잔여</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => {
                        const overshoot = it.month_spend - it.month_budget;
                        const isDanger = it.tone === 'danger';
                        // 진행바: 100% 넘으면 max 130%까지 표시
                        const barCap = 1.3;
                        const fillPct = Math.min(it.month_ratio, barCap) / barCap * 100;
                        const budgetMarkPct = (1 / barCap) * 100;  // 예산선(100%) 위치
                        return (
                          <tr key={it.account_code_id} style={{ borderTop: '1px solid #F3F4F6', background: 'white' }}>
                            <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 500 }}>{it.account_name}</div>
                              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                                {it.category_name}
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                              {/* 진행 바 */}
                              <div style={{
                                position: 'relative',
                                height: 8,
                                background: '#F3F4F6',
                                borderRadius: 4,
                                overflow: 'visible',
                              }}>
                                <div style={{
                                  width: `${fillPct}%`,
                                  height: '100%',
                                  background: isDanger ? '#DC2626' : '#F59E0B',
                                  borderRadius: 4,
                                }} />
                                {/* 예산선(100% 위치) */}
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
                              <div style={{
                                marginTop: 4,
                                fontSize: 10,
                                color: '#6B7280',
                                fontVariantNumeric: 'tabular-nums',
                                display: 'flex',
                                gap: 8,
                              }}>
                                <span>예산 <strong style={{ color: '#374151' }}>{it.month_budget.toLocaleString()}</strong></span>
                                <span>지출 <strong style={{ color: isDanger ? '#991B1B' : '#9A3412' }}>{it.month_spend.toLocaleString()}</strong></span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 10px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: isDanger ? '#FEE2E2' : '#FED7AA',
                                  color: isDanger ? '#991B1B' : '#9A3412',
                                }}
                              >
                                {pct(it.month_ratio)}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' }}>
                              {overshoot > 0 ? (
                                <span style={{ color: '#991B1B', fontWeight: 600 }}>
                                  +{overshoot.toLocaleString()}원
                                  <div style={{ fontSize: 9, color: '#9A3412', fontWeight: 400 }}>초과</div>
                                </span>
                              ) : (
                                <span style={{ color: '#6B7280' }}>
                                  {(it.month_budget - it.month_spend).toLocaleString()}원
                                  <div style={{ fontSize: 9, color: '#9CA3AF' }}>잔여</div>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
