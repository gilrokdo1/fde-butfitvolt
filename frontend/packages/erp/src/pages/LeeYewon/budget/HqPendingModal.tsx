import { useEffect, useState } from 'react';
import s from './ExpenseForm.module.css';
import { fetchHqPending, type HqPendingResponse } from './api';

interface Props {
  year: number;
  month: number;
  onClose: () => void;
}

/**
 * 본사 KPI "미정 대기" 클릭 시 띄우는 조회 전용 모달.
 * 지점별로 그룹화 + 사유 표시. 액션 버튼 없음 (재분류는 지점 모드에서).
 */
export default function HqPendingModal({ year, month, onClose }: Props) {
  const [data, setData] = useState<HqPendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHqPending(year, month)
      .then(setData)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '미정 조회 실패'));
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 820 }}
      >
        <header className={s.modalHeader}>
          <h3>
            <span style={{ fontFamily: 'Tossface' }}>&#x1F914;</span>{' '}
            미정 대기 · {year}-{String(month).padStart(2, '0')}
          </h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {loading && <p style={{ textAlign: 'center', color: '#6B7280' }}>불러오는 중...</p>}

          {!loading && data && data.grand_count === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#059669' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                ✓ 미정 대기 건이 없습니다
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
                활성 지점 모두 카테고리 분류가 완료되었습니다.
              </p>
            </div>
          )}

          {!loading && data && data.grand_count > 0 && (
            <>
              {/* 전체 합계 */}
              <div className={s.totalLine}>
                <span>전체 합계</span>
                <strong>
                  {data.grand_count}건 · {data.grand_total.toLocaleString()}원
                </strong>
              </div>

              {/* 지점별 그룹 */}
              {data.groups.map((g) => (
                <div
                  key={g.branch_id}
                  style={{
                    border: '1px solid #FDE68A',
                    background: '#FFFBEB',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* 그룹 헤더 */}
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#FEF3C7',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong style={{ color: '#78350F', fontSize: 13 }}>
                      🏢 {g.branch_name}
                    </strong>
                    <span style={{ fontSize: 12, color: '#92400E' }}>
                      {g.count}건 · <strong>{g.total.toLocaleString()}원</strong>
                    </span>
                  </div>

                  {/* 그룹 아이템 */}
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 10, color: '#78350F' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>주문일</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>품목</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>금액</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>작성자</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => (
                        <tr
                          key={it.id}
                          style={{ borderTop: '1px solid #FDE68A', background: 'white' }}
                        >
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            {it.order_date}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 500 }}>
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
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {it.effective.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            {it.created_by_name ?? '-'}
                          </td>
                          <td style={{ padding: '6px 10px', color: '#6B7280', fontSize: 11 }}>
                            {it.pending_reason || it.note || '-'}
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
                ℹ️ 본사는 조회 전용입니다. 각 지점에 사유 공유 후, 지점 모드의
                "🤔 미정 재분류" 에서 정식 카테고리로 옮길 수 있습니다.
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
