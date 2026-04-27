import { useEffect, useMemo, useRef, useState } from 'react';
import s from './FilterBar.module.css';
import type { AccountCategory } from './api';

interface Props {
  categories: AccountCategory[];
  /** 선택된 소카 id 집합. null 또는 빈 Set이면 "전체"로 간주 */
  selected: Set<number> | null;
  onChange: (selected: Set<number> | null) => void;
}

/**
 * 대카(7개) + 소카(11개) 트리 드롭다운.
 * - 대카 클릭: 그 안의 모든 소카 토글 (전체 ON / 전체 OFF)
 * - 일부 소카만 선택되면 대카 체크박스는 인디터미네이트(반쯤)
 * - selected가 null이면 모든 소카가 보이는 것 (= 전체)
 */
export default function CategoryFilter({ categories, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // 비-pending 카테고리만 필터에 노출. 미정 별도 처리.
  const visibleCats = useMemo(
    () => categories.filter((c) => !c.is_pending),
    [categories],
  );

  const allCodeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of visibleCats) for (const ac of c.codes) ids.add(ac.id);
    return ids;
  }, [visibleCats]);

  // 효과적 선택 = selected가 null이면 전체, 아니면 그대로
  const effective = selected ?? allCodeIds;
  const totalCount = allCodeIds.size;
  const selectedCount = selected === null ? totalCount : selected.size;
  const allSelected = selectedCount === totalCount;

  function toggleCode(id: number) {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === totalCount ? null : next);
  }

  function toggleCategory(cat: AccountCategory) {
    const catIds = cat.codes.map((c) => c.id);
    const allOn = catIds.every((id) => effective.has(id));
    const next = new Set(effective);
    if (allOn) for (const id of catIds) next.delete(id);
    else for (const id of catIds) next.add(id);
    onChange(next.size === totalCount ? null : next);
  }

  function selectAll() { onChange(null); }
  function clearAll() { onChange(new Set()); }

  function catState(cat: AccountCategory): 'all' | 'some' | 'none' {
    const catIds = cat.codes.map((c) => c.id);
    const onCount = catIds.filter((id) => effective.has(id)).length;
    if (onCount === 0) return 'none';
    if (onCount === catIds.length) return 'all';
    return 'some';
  }

  return (
    <div className={s.dropdown} ref={ref}>
      <button
        type="button"
        className={s.dropdownTrigger}
        onClick={() => setOpen((v) => !v)}
      >
        계정
        <span className={s.dropdownCount}>
          {allSelected ? '전체' : `${selectedCount}/${totalCount}`}
        </span>
        <span className={s.dropdownArrow}>▾</span>
      </button>

      {open && (
        <div className={s.dropdownPanel} style={{ minWidth: 280 }}>
          <div className={s.dropdownHeader}>
            <button type="button" className={s.miniBtn} onClick={selectAll}>
              전체 선택
            </button>
            <button type="button" className={s.miniBtn} onClick={clearAll}>
              전체 해제
            </button>
          </div>
          <div className={s.dropdownBody}>
            {visibleCats.map((cat) => {
              const state = catState(cat);
              return (
                <div key={cat.id} className={s.catBlock}>
                  <label className={s.catRow}>
                    <input
                      type="checkbox"
                      checked={state === 'all'}
                      ref={(el) => { if (el) el.indeterminate = state === 'some'; }}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span className={s.catName}>{cat.name}</span>
                    <span className={s.catCount}>{cat.codes.length}</span>
                  </label>
                  <div className={s.subList}>
                    {cat.codes.map((ac) => (
                      <label key={ac.id} className={s.subRow}>
                        <input
                          type="checkbox"
                          checked={effective.has(ac.id)}
                          onChange={() => toggleCode(ac.id)}
                        />
                        <span>{ac.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
