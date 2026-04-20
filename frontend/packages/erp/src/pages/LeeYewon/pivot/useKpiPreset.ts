import { useEffect, useState } from 'react';
import type { KpiBarState } from './kpiCards';

const VERSION_KEY_PREFIX = 'yewon_kpi_preset_v1::';

function storageKey(queryId: string): string {
  return `${VERSION_KEY_PREFIX}${queryId}`;
}

function loadFromStorage(queryId: string): KpiBarState | null {
  try {
    const raw = localStorage.getItem(storageKey(queryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.mode !== 'auto' && parsed.mode !== 'custom') return null;
    if (!Array.isArray(parsed.cards)) return null;
    return parsed as KpiBarState;
  } catch {
    return null;
  }
}

const DEFAULT_STATE: KpiBarState = {
  mode: 'auto',
  cards: [],
  showRowCount: true,
};

/**
 * 쿼리별 KPI 카드 프리셋을 localStorage와 동기화하는 훅.
 * queryId가 바뀌면 해당 쿼리의 프리셋으로 자동 전환.
 */
export function useKpiPreset(queryId: string) {
  const [state, setState] = useState<KpiBarState>(() => {
    return loadFromStorage(queryId) ?? DEFAULT_STATE;
  });

  // queryId 변경 시 재로드
  useEffect(() => {
    const loaded = loadFromStorage(queryId) ?? DEFAULT_STATE;
    setState(loaded);
  }, [queryId]);

  // 상태 변경 시 저장
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(queryId), JSON.stringify(state));
    } catch {
      // quota 초과 등은 조용히 실패
    }
  }, [state, queryId]);

  return [state, setState] as const;
}
