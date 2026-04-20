import { useState } from 'react';
import s from './TemplateSelector.module.css';
import type { PivotTemplate } from './pivotTemplates';

interface Props {
  templates: PivotTemplate[];
  selectedId: string | null;
  onApply: (template: PivotTemplate) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export default function TemplateSelector({
  templates,
  selectedId,
  onApply,
  onSaveCurrent,
  onDelete,
  onRename,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (tpl) onApply(tpl);
  };

  const handleSave = () => {
    onSaveCurrent(saveName);
    setSaveName('');
    setSaveOpen(false);
  };

  const handleRename = () => {
    if (!selectedId) return;
    const tpl = templates.find((t) => t.id === selectedId);
    if (!tpl) return;
    const name = prompt('템플릿 이름 변경', tpl.name);
    if (name && name.trim()) onRename(selectedId, name.trim());
  };

  const handleDelete = () => {
    if (!selectedId) return;
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    onDelete(selectedId);
  };

  return (
    <>
      <div className={s.group}>
        <label className={s.label}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4D2;</span> 템플릿
        </label>
        <select
          className={s.select}
          value={selectedId ?? ''}
          onChange={handleSelectChange}
        >
          <option value="">{templates.length === 0 ? '저장된 템플릿 없음' : '템플릿 선택...'}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {selectedId && (
          <>
            <button className={s.iconBtn} onClick={handleRename} title="이름 변경">✏️</button>
            <button className={`${s.iconBtn} ${s.deleteBtn}`} onClick={handleDelete} title="삭제">🗑️</button>
          </>
        )}

        <button className={s.saveBtn} onClick={() => setSaveOpen(true)}>
          + 현재 상태 저장
        </button>
      </div>

      {saveOpen && (
        <div className={s.overlay} onClick={() => setSaveOpen(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.modalTitle}>템플릿 저장</h3>
            <p className={s.modalDesc}>
              현재 쿼리 · 피벗 설정 · KPI 카드를 모아 하나의 템플릿으로 저장합니다.
            </p>
            <label className={s.formLabel}>이름</label>
            <input
              className={s.input}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="예: 카페 월별 매출"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setSaveOpen(false);
              }}
            />
            <div className={s.modalActions}>
              <button className={s.cancelBtn} onClick={() => setSaveOpen(false)}>취소</button>
              <button className={s.primaryBtn} onClick={handleSave} disabled={!saveName.trim()}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
