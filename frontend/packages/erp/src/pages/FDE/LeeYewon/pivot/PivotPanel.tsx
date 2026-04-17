import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import s from './PivotPanel.module.css';
import type { AggType, PivotConfig } from './pivotEngine';

interface Props {
  allFields: string[];
  config: PivotConfig;
  onChange: (config: PivotConfig) => void;
  uniqueValues: Record<string, string[]>;
  onCollapse?: () => void;
}

function usedFields(config: PivotConfig): Set<string> {
  const set = new Set<string>();
  config.rows.forEach((f) => set.add(f));
  config.columns.forEach((f) => set.add(f));
  config.values.forEach((v) => set.add(v.field));
  return set;
}

// --- 드래그 가능한 칩 (필드 목록용 + 드롭존용 공통) ---
function DraggableChip({
  dragId,
  label,
  className,
  children,
}: {
  dragId: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  return (
    <div
      ref={setNodeRef}
      className={`${className || ''} ${isDragging ? s.chipDragging : ''}`}
      {...listeners}
      {...attributes}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}

// --- 드롭존 ---
function DropZone({
  id,
  title,
  items,
  onRemove,
  renderExtra,
}: {
  id: string;
  title: string;
  items: string[];
  onRemove: (field: string) => void;
  renderExtra?: (field: string) => React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div className={s.dropSection}>
      <div className={s.dropLabel}>{title}</div>
      <div ref={setNodeRef} className={`${s.dropZone} ${isOver ? s.dropZoneOver : ''}`}>
        {items.length === 0 && <span className={s.dropHint}>여기에 드래그</span>}
        {items.map((f) => (
          <DraggableChip key={f} dragId={`${id}::${f}`} label={f} className={s.dropChip}>
            {renderExtra?.(f)}
            <button className={s.removeBtn} onClick={() => onRemove(f)} onPointerDown={(e) => e.stopPropagation()}>
              ×
            </button>
          </DraggableChip>
        ))}
      </div>
    </div>
  );
}

// --- 필터 드롭존 ---
function FilterZone({
  fields,
  filters,
  uniqueValues,
  onRemove,
  onFilterChange,
}: {
  fields: string[];
  filters: Record<string, string[]>;
  uniqueValues: Record<string, string[]>;
  onRemove: (field: string) => void;
  onFilterChange: (field: string, values: string[]) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: 'filters' });
  const [openField, setOpenField] = useState<string | null>(null);
  const [searchMap, setSearchMap] = useState<Record<string, string>>({});

  return (
    <div className={s.dropSection}>
      <div className={s.dropLabel}>⑥ 필터</div>
      <div ref={setNodeRef} className={`${s.dropZone} ${isOver ? s.dropZoneOver : ''}`}>
        {fields.length === 0 && <span className={s.dropHint}>여기에 드래그</span>}
        {fields.map((f) => {
          const values = uniqueValues[f] || [];
          const selected = filters[f] || [];
          const isOpen = openField === f;
          const search = (searchMap[f] || '').toLowerCase();
          const filteredValues = search ? values.filter((v) => v.toLowerCase().includes(search)) : values;
          return (
            <div key={f} className={s.filterItem}>
              <DraggableChip dragId={`filters::${f}`} label="" className={s.dropChip}>
                <button
                  className={s.filterToggle}
                  onClick={() => setOpenField(isOpen ? null : f)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {f} {selected.length > 0 ? `(${selected.length})` : '(전체)'}
                </button>
                <button className={s.removeBtn} onClick={() => onRemove(f)} onPointerDown={(e) => e.stopPropagation()}>
                  ×
                </button>
              </DraggableChip>
              {isOpen && (
                <div className={s.filterDropdown}>
                  <input
                    className={s.filterSearch}
                    placeholder={`검색 (${values.length}개)`}
                    value={searchMap[f] || ''}
                    onChange={(e) => setSearchMap({ ...searchMap, [f]: e.target.value })}
                    autoFocus
                  />
                  <div className={s.filterActions}>
                    <button
                      className={s.filterActionBtn}
                      onClick={() => onFilterChange(f, [])}
                    >
                      전체 선택
                    </button>
                    <button
                      className={s.filterActionBtn}
                      onClick={() => onFilterChange(f, ['__empty__'])}
                    >
                      전체 해제
                    </button>
                  </div>
                  <div className={s.filterList}>
                    {filteredValues.map((v) => (
                      <label key={v} className={s.filterOption}>
                        <input
                          type="checkbox"
                          checked={selected.length === 0 || selected.includes(v)}
                          onChange={(e) => {
                            if (selected.length === 0) {
                              onFilterChange(f, values.filter((x) => x !== v));
                            } else if (e.target.checked) {
                              const next = [...selected, v];
                              onFilterChange(f, next.length === values.length ? [] : next);
                            } else {
                              onFilterChange(f, selected.filter((x) => x !== v));
                            }
                          }}
                        />
                        {v}
                      </label>
                    ))}
                    {filteredValues.length === 0 && (
                      <span className={s.dropHint}>결과 없음</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- dragId에서 소속 존과 필드명 파싱 ---
function parseDragId(id: string): { zone: string | null; field: string } {
  const idx = id.indexOf('::');
  if (idx === -1) return { zone: null, field: id }; // 필드 목록에서 온 것
  return { zone: id.slice(0, idx), field: id.slice(idx + 2) };
}

export default function PivotPanel({ allFields, config, onChange, uniqueValues, onCollapse }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const used = usedFields(config);
  const filterFields = Object.keys(config.filters);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { zone: fromZone, field } = parseDragId(String(e.active.id));
    const toZone = e.over?.id as string | undefined;
    if (!toZone) return;

    // 같은 존이면 무시
    if (fromZone === toZone) return;

    const next = { ...config };

    // 필터로 드롭 — 중복 허용 (기존 위치 유지)
    if (toZone === 'filters') {
      if (!(field in next.filters)) {
        next.filters = { ...next.filters, [field]: [] };
      }
      // 다른 존에서 필터로 옮긴 거면 기존 존에서 제거
      if (fromZone && fromZone !== 'filters') {
        next.rows = next.rows.filter((f) => f !== field);
        next.columns = next.columns.filter((f) => f !== field);
        next.values = next.values.filter((v) => v.field !== field);
      }
      onChange(next);
      return;
    }

    // 행/열/값으로 드롭 — 기존 행/열/값에서 제거 (필터에서 온 거면 필터에서도 제거)
    next.rows = next.rows.filter((f) => f !== field);
    next.columns = next.columns.filter((f) => f !== field);
    next.values = next.values.filter((v) => v.field !== field);
    if (fromZone === 'filters') {
      const newFilters = { ...next.filters };
      delete newFilters[field];
      next.filters = newFilters;
    }

    if (toZone === 'rows') {
      next.rows = [...next.rows, field];
    } else if (toZone === 'columns') {
      next.columns = [...next.columns, field];
    } else if (toZone === 'values') {
      const agg: AggType = ['price', 'plate', 'quantity'].includes(field) ? 'SUM' : 'COUNT';
      next.values = [...next.values, { field, agg }];
    }

    onChange(next);
  };

  const removeFromRows = (f: string) => onChange({ ...config, rows: config.rows.filter((x) => x !== f) });
  const removeFromCols = (f: string) => onChange({ ...config, columns: config.columns.filter((x) => x !== f) });
  const removeFromValues = (f: string) => onChange({ ...config, values: config.values.filter((v) => v.field !== f) });
  const removeFromFilters = (f: string) => {
    const next = { ...config.filters };
    delete next[f];
    onChange({ ...config, filters: next });
  };

  const changeAgg = (field: string, agg: AggType) => {
    onChange({
      ...config,
      values: config.values.map((v) => (v.field === field ? { ...v, agg } : v)),
    });
  };

  const handleFilterChange = (field: string, values: string[]) => {
    onChange({ ...config, filters: { ...config.filters, [field]: values } });
  };

  const activeField = activeId ? parseDragId(activeId).field : null;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={s.panel}>
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div className={s.sectionLabel}>② 필드 목록</div>
            {onCollapse && (
              <button
                className={s.collapseBtn}
                onClick={onCollapse}
                title="필드 패널 숨기기"
              >
                ◀
              </button>
            )}
          </div>
          <div className={s.fieldList}>
            {allFields.map((f) => (
              <DraggableChip
                key={f}
                dragId={f}
                label={f}
                className={`${s.chip} ${used.has(f) ? s.chipUsed : ''}`}
              >
                {used.has(f) && <span className={s.chipBadge}>배치됨</span>}
              </DraggableChip>
            ))}
          </div>
        </div>

        <DropZone id="rows" title="③ 행" items={config.rows} onRemove={removeFromRows} />
        <DropZone id="columns" title="④ 열" items={config.columns} onRemove={removeFromCols} />
        <DropZone
          id="values"
          title="⑤ 값"
          items={config.values.map((v) => v.field)}
          onRemove={removeFromValues}
          renderExtra={(field) => {
            const vf = config.values.find((v) => v.field === field);
            if (!vf) return null;
            return (
              <select
                className={s.aggSelect}
                value={vf.agg}
                onChange={(e) => changeAgg(field, e.target.value as AggType)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="SUM">SUM</option>
                <option value="COUNT">COUNT</option>
                <option value="AVG">AVG</option>
              </select>
            );
          }}
        />
        <FilterZone
          fields={filterFields}
          filters={config.filters}
          uniqueValues={uniqueValues}
          onRemove={removeFromFilters}
          onFilterChange={handleFilterChange}
        />

        <div className={s.section}>
          <div className={s.sectionLabel}>⑦ 합계 표시</div>
          <label className={s.toggleLabel}>
            <input
              type="checkbox"
              checked={config.showRowTotals !== false}
              onChange={(e) => onChange({ ...config, showRowTotals: e.target.checked })}
            />
            행 합계 (우측)
          </label>
          <label className={s.toggleLabel}>
            <input
              type="checkbox"
              checked={config.showColTotals !== false}
              onChange={(e) => onChange({ ...config, showColTotals: e.target.checked })}
            />
            열 합계 (하단)
          </label>
        </div>
      </div>

      <DragOverlay>
        {activeField ? <div className={s.dragOverlay}>{activeField}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
