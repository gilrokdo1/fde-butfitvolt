import { useEffect, useRef, useState } from 'react';
import s from './FilterBar.module.css';

export interface FilterOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  label: string;
  options: FilterOption<T>[];
  selected: Set<T> | null;  // null = 전체
  onChange: (next: Set<T> | null) => void;
}

/**
 * 단순 다중선택 드롭다운. 상태/수령/작성자/이관 필터 공용.
 */
export default function MultiSelectFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const total = options.length;
  const effective = selected ?? new Set(options.map((o) => o.value));
  const selectedCount = selected === null ? total : selected.size;
  const allSelected = selectedCount === total;

  function toggle(value: T) {
    const next = new Set(effective);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === total ? null : next);
  }

  return (
    <div className={s.dropdown} ref={ref}>
      <button
        type="button"
        className={s.dropdownTrigger}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className={s.dropdownCount}>
          {allSelected ? '전체' : `${selectedCount}/${total}`}
        </span>
        <span className={s.dropdownArrow}>▾</span>
      </button>

      {open && (
        <div className={s.dropdownPanel}>
          <div className={s.dropdownHeader}>
            <button
              type="button"
              className={s.miniBtn}
              onClick={() => onChange(null)}
            >
              전체 선택
            </button>
            <button
              type="button"
              className={s.miniBtn}
              onClick={() => onChange(new Set())}
            >
              전체 해제
            </button>
          </div>
          <div className={s.dropdownBody}>
            {options.map((opt) => (
              <label key={String(opt.value)} className={s.subRow}>
                <input
                  type="checkbox"
                  checked={effective.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
