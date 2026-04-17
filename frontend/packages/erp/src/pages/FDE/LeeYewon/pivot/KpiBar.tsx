import { useMemo, useState } from 'react';
import s from './KpiBar.module.css';
import KpiCardEditor from './KpiCardEditor';
import {
  computeKpiCard,
  formatKpiValue,
  migrateAutoToCustom,
  suggestLabel,
  type CustomKpiCard,
  type KpiBarState,
} from './kpiCards';
import type { ValueField } from './pivotEngine';

interface Props {
  rawRows: Record<string, unknown>[];
  allFields: string[];
  uniqueValues: Record<string, string[]>;
  autoValues: ValueField[];       // config.values — auto 모드에서 카드 생성 기준
  totalRows: number;
  state: KpiBarState;
  onStateChange: (next: KpiBarState) => void;
}

export default function KpiBar({
  rawRows,
  allFields,
  uniqueValues,
  autoValues,
  totalRows,
  state,
  onStateChange,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CustomKpiCard | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // 표시할 카드 목록 (auto 모드면 autoValues에서 즉석 생성)
  const displayCards: CustomKpiCard[] = useMemo(() => {
    if (state.mode === 'auto') {
      return migrateAutoToCustom(autoValues);
    }
    return state.cards;
  }, [state, autoValues]);

  // 각 카드별 계산 결과
  const results = useMemo(
    () => displayCards.map((card) => computeKpiCard(rawRows, card, allFields)),
    [displayCards, rawRows, allFields],
  );

  // × 클릭 → auto면 migrate 후 제거, custom이면 단순 제거
  const removeCard = (id: string) => {
    if (state.mode === 'auto') {
      const migrated = migrateAutoToCustom(autoValues).filter((c) => c.id !== id);
      onStateChange({ ...state, mode: 'custom', cards: migrated });
    } else {
      onStateChange({ ...state, cards: state.cards.filter((c) => c.id !== id) });
    }
  };

  const addCard = (card: CustomKpiCard) => {
    if (state.mode === 'auto') {
      const migrated = migrateAutoToCustom(autoValues);
      onStateChange({ ...state, mode: 'custom', cards: [...migrated, card] });
    } else {
      onStateChange({ ...state, cards: [...state.cards, card] });
    }
    setEditorOpen(false);
    setEditingCard(null);
  };

  const updateCard = (card: CustomKpiCard) => {
    onStateChange({
      ...state,
      cards: state.cards.map((c) => (c.id === card.id ? card : c)),
    });
    setEditorOpen(false);
    setEditingCard(null);
  };

  const resetToDefault = () => {
    onStateChange({ mode: 'auto', cards: [], showRowCount: true });
    setMenuOpen(false);
  };

  const clearAll = () => {
    onStateChange({ mode: 'custom', cards: [], showRowCount: state.showRowCount });
    setMenuOpen(false);
  };

  const toggleRowCount = () => {
    onStateChange({ ...state, showRowCount: !state.showRowCount });
    setMenuOpen(false);
  };

  const openEditor = (card?: CustomKpiCard) => {
    setEditingCard(card ?? null);
    setEditorOpen(true);
    setMenuOpen(false);
  };

  return (
    <>
      <div className={s.bar}>
        {state.showRowCount && (
          <div className={s.card}>
            <span className={s.label}>조회 건수</span>
            <span className={s.value}>{totalRows.toLocaleString('ko-KR')}</span>
          </div>
        )}

        {displayCards.map((card, i) => {
          const result = results[i];
          const hasError = !!result?.error;
          return (
            <div
              key={card.id}
              className={`${s.card} ${hasError ? s.cardError : ''}`}
              style={card.color ? { background: card.color + '1A' } : undefined}
              onDoubleClick={() => openEditor(card)}
              title="더블클릭으로 수정"
            >
              <button
                className={s.removeBtn}
                onClick={() => removeCard(card.id)}
                title="삭제"
              >
                ×
              </button>
              <span className={s.label}>
                {card.label || suggestLabel(card)}
                {card.kind === 'conditional' && (
                  <span className={s.condBadge}>조건</span>
                )}
              </span>
              <span
                className={s.value}
                style={card.color ? { color: card.color } : undefined}
              >
                {hasError ? '—' : formatKpiValue(result?.value ?? null)}
              </span>
              {hasError && (
                <span className={s.errorText} title={result?.error}>
                  ⚠ {result?.error}
                </span>
              )}
            </div>
          );
        })}

        <button className={s.addBtn} onClick={() => openEditor()}>
          + 카드 추가
        </button>

        <div className={s.menuWrap}>
          <button
            className={s.menuBtn}
            onClick={() => setMenuOpen((o) => !o)}
            title="더보기"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className={s.menuBackdrop} onClick={() => setMenuOpen(false)} />
              <div className={s.menu}>
                <button className={s.menuItem} onClick={resetToDefault}>
                  디폴트로 초기화
                </button>
                <button className={s.menuItem} onClick={clearAll}>
                  모두 삭제
                </button>
                <button className={s.menuItem} onClick={toggleRowCount}>
                  조회 건수 {state.showRowCount ? '숨기기' : '보이기'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {editorOpen && (
        <KpiCardEditor
          rawRows={rawRows}
          allFields={allFields}
          uniqueValues={uniqueValues}
          editing={editingCard}
          onSave={editingCard ? updateCard : addCard}
          onClose={() => {
            setEditorOpen(false);
            setEditingCard(null);
          }}
        />
      )}
    </>
  );
}
