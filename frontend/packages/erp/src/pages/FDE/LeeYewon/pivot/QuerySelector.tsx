import { useEffect, useState } from 'react';
import s from './QuerySelector.module.css';

export interface SavedQuery {
  id: number;
  name: string;
  description: string;
  sql: string;
  created_at: string;
  updated_at?: string;
}

interface Props {
  currentSql: string;
  onSelect: (sql: string) => void;
  onRunQuery: () => void;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token') || '';
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `요청 실패 (${res.status})`);
  }
  return res.json();
}

export default function QuerySelector({ currentSql, onSelect, onRunQuery }: Props) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editQuery, setEditQuery] = useState<SavedQuery | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSql, setFormSql] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueries = async () => {
    try {
      const data = await apiFetch<SavedQuery[]>('/fde-api/pivot/queries');
      setQueries(data);
    } catch {
      // 조용히 실패
    }
  };

  useEffect(() => {
    loadQueries();
  }, []);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (id === -1) {
      // 기본 쿼리
      setSelectedId(null);
      onSelect('');
      return;
    }
    const q = queries.find((q) => q.id === id);
    if (q) {
      setSelectedId(q.id);
      onSelect(q.sql);
    }
  };

  const openSaveModal = () => {
    setEditQuery(null);
    setFormName('');
    setFormDesc('');
    setFormSql(currentSql);
    setError(null);
    setShowModal(true);
  };

  const openEditModal = () => {
    const q = queries.find((q) => q.id === selectedId);
    if (!q) return;
    setEditQuery(q);
    setFormName(q.name);
    setFormDesc(q.description);
    setFormSql(q.sql);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('이름을 입력하세요');
      return;
    }
    if (!formSql.trim()) {
      setError('SQL을 입력하세요');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editQuery) {
        await apiFetch(`/fde-api/pivot/queries/${editQuery.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: formName, description: formDesc, sql: formSql }),
        });
      } else {
        await apiFetch('/fde-api/pivot/queries', {
          method: 'POST',
          body: JSON.stringify({ name: formName, description: formDesc, sql: formSql }),
        });
      }
      await loadQueries();
      setShowModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm('이 쿼리를 삭제하시겠습니까?')) return;
    try {
      await apiFetch(`/fde-api/pivot/queries/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      onSelect('');
      await loadQueries();
    } catch {
      // 조용히 실패
    }
  };

  return (
    <>
      <div className={s.bar}>
        <div className={s.selectGroup}>
          <label className={s.label}>① 쿼리</label>
          <select
            className={s.select}
            value={selectedId ?? -1}
            onChange={handleSelectChange}
          >
            <option value={-1}>기본 (B-Store 판매)</option>
            {queries.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        <div className={s.actions}>
          {selectedId && (
            <>
              <button className={s.actionBtn} onClick={openEditModal} title="수정">✏️</button>
              <button className={`${s.actionBtn} ${s.deleteBtn}`} onClick={handleDelete} title="삭제">🗑️</button>
            </>
          )}
          <button className={s.saveBtn} onClick={openSaveModal}>+ 저장</button>
          <button className={s.runBtn} onClick={onRunQuery}>실행</button>
        </div>
      </div>

      {showModal && (
        <div className={s.overlay} onClick={() => setShowModal(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.modalTitle}>{editQuery ? '쿼리 수정' : '쿼리 저장'}</h3>

            <label className={s.fieldLabel}>이름</label>
            <input
              className={s.input}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="예: 지점별 월별 매출"
            />

            <label className={s.fieldLabel}>설명 (선택)</label>
            <input
              className={s.input}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="이 쿼리가 하는 일"
            />

            <label className={s.fieldLabel}>SQL</label>
            <textarea
              className={s.textarea}
              value={formSql}
              onChange={(e) => setFormSql(e.target.value)}
              rows={8}
              spellCheck={false}
            />

            {error && <p className={s.error}>{error}</p>}

            <div className={s.modalActions}>
              <button className={s.cancelBtn} onClick={() => setShowModal(false)}>취소</button>
              <button className={s.confirmBtn} onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : editQuery ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
