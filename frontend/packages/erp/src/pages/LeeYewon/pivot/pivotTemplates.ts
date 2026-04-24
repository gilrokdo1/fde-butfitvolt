/**
 * 피벗 템플릿 — 쿼리 SQL + 피벗 설정 + KPI 카드를 번들로 저장/복원.
 * localStorage 전용 (개인용).
 */

import { useEffect, useState, useCallback } from 'react';
import type { PivotConfig } from './pivotEngine';
import type { KpiBarState } from './kpiCards';

export interface PivotTemplate {
  id: string;
  name: string;
  sql: string;
  pivotConfig: PivotConfig;
  kpiPreset: KpiBarState;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'yewon_pivot_templates_v1';

function loadAll(): PivotTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string');
  } catch {
    return [];
  }
}

function saveAll(templates: PivotTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // quota 초과 등은 조용히 실패
  }
}

function makeId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 템플릿 CRUD 훅 */
export function usePivotTemplates() {
  const [templates, setTemplates] = useState<PivotTemplate[]>(() => loadAll());

  // 다른 탭에서의 변경 반영 (선택적)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTemplates(loadAll());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback(
    (name: string, snapshot: Omit<PivotTemplate, 'id' | 'name' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const tpl: PivotTemplate = {
        id: makeId(),
        name: name.trim() || '이름 없음',
        ...snapshot,
        createdAt: now,
        updatedAt: now,
      };
      const next = [tpl, ...templates];
      setTemplates(next);
      saveAll(next);
      return tpl;
    },
    [templates],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<PivotTemplate, 'id' | 'createdAt'>>) => {
      const next = templates.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      );
      setTemplates(next);
      saveAll(next);
    },
    [templates],
  );

  const remove = useCallback(
    (id: string) => {
      const next = templates.filter((t) => t.id !== id);
      setTemplates(next);
      saveAll(next);
    },
    [templates],
  );

  const rename = useCallback(
    (id: string, name: string) => update(id, { name: name.trim() || '이름 없음' }),
    [update],
  );

  return { templates, create, update, remove, rename };
}
