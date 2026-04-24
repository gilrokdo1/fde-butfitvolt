import { useEffect, useState } from 'react';
import s from './ExpenseForm.module.css';
import {
  fetchMigrationStatus,
  fetchValidation,
  runMigration,
  type Branch,
  type MigrationResult,
  type MigrationStatus,
  type ValidationAggregate,
} from './api';

interface Props {
  branch: Branch;
  onClose: () => void;
  onDone: () => void;
}

/** 파일 업로드 → 백엔드 이관 API 호출 → 검증 결과까지 한 번에 보여주는 모달. */
export default function MigrationModal({ branch, onClose, onDone }: Props) {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ expenses: number; budget: number; writers: string[] } | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [validation, setValidation] = useState<ValidationAggregate | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMigrationStatus(branch.code)
      .then(setStatus)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '상태 조회 실패'));
      });
  }, [branch.code]);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      if (!json.budget || !Array.isArray(json.expenses)) {
        throw new Error('JSON 구조가 올바르지 않습니다 (budget, expenses 필드 필요)');
      }
      const writers = Array.from(
        new Set<string>(json.expenses.map((e: { created_by_name: string }) => e.created_by_name)),
      );
      setPreview({
        expenses: json.expenses.length,
        budget: json.budget.rows?.length ?? 0,
        writers,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 파싱 실패');
      setPreview(null);
    }
  }

  async function executeMigration() {
    if (!file) return;
    setRunning(true);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const payload = {
        branch_code: json.branch_code ?? branch.code,
        budget: json.budget,
        expenses: json.expenses,
      };
      const res = await runMigration(branch.code, payload);
      setResult(res);
      const val = await fetchValidation(branch.id, json.budget.year ?? new Date().getFullYear());
      setValidation(val);
      onDone();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: unknown } } };
      const detail = anyErr.response?.data?.detail;
      setError(
        typeof detail === 'string' ? detail
          : detail ? JSON.stringify(detail)
          : (e instanceof Error ? e.message : '이관 실패'),
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={s.backdrop} onClick={running ? undefined : onClose}>
      <div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <header className={s.modalHeader}>
          <h3>데이터 이관 · {branch.name}</h3>
          <button className={s.closeBtn} onClick={onClose} disabled={running}>✕</button>
        </header>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.body}>
          {status && (
            <div className={s.totalLine} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>이미 이관된 지출</span>
                <strong>{status.migrated_expenses}건</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>등록된 예산 행</span>
                <strong>{status.annual_budget_rows}행</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>이관 준비 상태</span>
                <strong style={{ color: status.ready ? '#059669' : '#DC2626' }}>
                  {status.ready ? '✓ 실행 가능' : '✗ 이미 이관됨'}
                </strong>
              </div>
            </div>
          )}

          {!result && status?.ready && (
            <>
              <div className={s.row}>
                <label className={s.fullWidth}>
                  <span>이관 JSON 업로드 *</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                    disabled={running}
                  />
                </label>
              </div>

              {preview && (
                <div style={{ padding: 12, background: '#EFF6FF', borderRadius: 6, fontSize: 13 }}>
                  <p style={{ margin: 0 }}>
                    <strong>업로드 확인:</strong> 예산 {preview.budget}행 / 지출 {preview.expenses}건
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 12 }}>
                    작성자 {preview.writers.length}명: {preview.writers.join(', ')}
                  </p>
                </div>
              )}
            </>
          )}

          {result && (
            <div style={{ padding: 12, background: '#ECFDF5', borderRadius: 6, fontSize: 13 }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#065F46' }}>✓ 이관 완료</p>
              <ul style={{ margin: '8px 0 0 20px', padding: 0, color: '#374151' }}>
                <li>예산 행: {result.budget_rows_inserted}행</li>
                <li>지출: {result.expenses_inserted}건 (미정 {result.pending_expenses}건)</li>
                <li>작성자: {result.writers_registered}명 등록</li>
              </ul>
            </div>
          )}

          {validation && (
            <div>
              <h4 style={{ margin: '8px 0', fontSize: 13 }}>검증: 월별 합계 (원, VAT+)</h4>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>월</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>건수</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.by_month.map((m) => (
                    <tr key={m.month} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: 6 }}>{validation.year}-{String(m.month).padStart(2, '0')}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{m.count}건</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{Number(m.total).toLocaleString()}</td>
                    </tr>
                  ))}
                  {validation.pending.count > 0 && (
                    <tr style={{ background: '#FFFBEB', color: '#92400E' }}>
                      <td style={{ padding: 6 }}>미정 (집계 외)</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{validation.pending.count}건</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{validation.pending.total.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <p style={{ fontSize: 11, color: '#6B7280', marginTop: 8 }}>
                시트 대시보드 "월별 실 지출 (VAT+)" 값과 비교해 차이 확인.
              </p>
            </div>
          )}
        </div>

        <footer className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose} disabled={running}>
            {result ? '닫기' : '취소'}
          </button>
          {!result && status?.ready && (
            <button
              className={s.saveBtn}
              onClick={executeMigration}
              disabled={!file || !preview || running}
            >
              {running ? '이관 중...' : '이관 실행'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
