/**
 * KPI 카드 커스터마이제이션 — 타입 + 계산 로직 (순수 함수)
 *
 * Phase 1: Total, Conditional (+ 6 ExtendedAggType)
 * Phase 2: Ratio, TopN
 */

import { getFieldValue, getNumericValue, isNumericValue } from './pivotEngine';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ExtendedAggType = 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' | 'DISTINCT';

export interface KpiCondition {
  field: string;
  values: string[]; // 1개면 단일 등식, 2+는 OR (IN 의미). 0이면 조건 무시
}

export interface KpiAggregation {
  field: string;                // COUNT의 경우 '*' 허용
  agg: ExtendedAggType;
  conditions?: KpiCondition[];  // 여러 조건은 AND
}

export interface TotalCard {
  id: string;
  kind: 'total';
  label: string;
  color?: string;
  aggregation: KpiAggregation;  // conditions 비어있음 기대
}

export interface ConditionalCard {
  id: string;
  kind: 'conditional';
  label: string;
  color?: string;
  aggregation: KpiAggregation;  // conditions 1개 이상
}

// Phase 2: Ratio / TopN — 타입만 placeholder
export type CustomKpiCard = TotalCard | ConditionalCard;

export interface KpiBarState {
  mode: 'auto' | 'custom';
  cards: CustomKpiCard[];
  showRowCount: boolean;
}

export interface KpiCardResult {
  card: CustomKpiCard;
  value: number | null;         // null이면 표시 불가 (0행/필드 누락 등)
  error?: string;               // UI에 표시할 에러 메시지 (툴팁용)
}

// ---------------------------------------------------------------------------
// 계산 로직
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function applyConditions(rows: Row[], conditions?: KpiCondition[]): Row[] {
  if (!conditions || conditions.length === 0) return rows;
  let filtered = rows;
  for (const cond of conditions) {
    if (!cond.field || cond.values.length === 0) continue; // 조건 비활성
    const allowed = new Set(cond.values);
    filtered = filtered.filter((r) => allowed.has(getFieldValue(r, cond.field)));
  }
  return filtered;
}

function computeAggregation(rows: Row[], agg: KpiAggregation): number | null {
  const filtered = applyConditions(rows, agg.conditions);

  if (agg.agg === 'COUNT') {
    if (agg.field === '*' || !agg.field) return filtered.length;
    // 특정 필드의 non-null 행만 카운트
    return filtered.filter((r) => r[agg.field] !== null && r[agg.field] !== undefined).length;
  }

  if (agg.agg === 'DISTINCT') {
    const set = new Set<string>();
    for (const r of filtered) set.add(getFieldValue(r, agg.field));
    return set.size;
  }

  if (agg.agg === 'SUM') {
    let sum = 0;
    for (const r of filtered) sum += getNumericValue(r, agg.field);
    return sum;
  }

  if (agg.agg === 'AVG') {
    let sum = 0;
    let cnt = 0;
    for (const r of filtered) {
      if (!isNumericValue(r, agg.field)) continue; // 분모에서 제외
      sum += getNumericValue(r, agg.field);
      cnt++;
    }
    return cnt === 0 ? null : sum / cnt;
  }

  if (agg.agg === 'MAX' || agg.agg === 'MIN') {
    let result: number | null = null;
    for (const r of filtered) {
      if (!isNumericValue(r, agg.field)) continue;
      const n = getNumericValue(r, agg.field);
      if (result === null) result = n;
      else if (agg.agg === 'MAX' && n > result) result = n;
      else if (agg.agg === 'MIN' && n < result) result = n;
    }
    return result;
  }

  return null;
}

export function computeKpiCard(
  rows: Row[],
  card: CustomKpiCard,
  allFields: string[],
): KpiCardResult {
  // 필드 존재 여부 검증
  const missingFields: string[] = [];
  const agg = card.aggregation;
  if (agg.field && agg.field !== '*' && !allFields.includes(agg.field)) {
    missingFields.push(agg.field);
  }
  for (const cond of agg.conditions || []) {
    if (cond.field && !allFields.includes(cond.field)) {
      missingFields.push(cond.field);
    }
  }
  if (missingFields.length > 0) {
    return {
      card,
      value: null,
      error: `필드 없음: ${missingFields.join(', ')}`,
    };
  }

  if (rows.length === 0) {
    return { card, value: null, error: '데이터 없음' };
  }

  const value = computeAggregation(rows, agg);
  return { card, value };
}

// ---------------------------------------------------------------------------
// 자동 라벨 추천
// ---------------------------------------------------------------------------

const AGG_LABEL: Record<ExtendedAggType, string> = {
  SUM: '합계',
  COUNT: '건수',
  AVG: '평균',
  MAX: '최댓값',
  MIN: '최솟값',
  DISTINCT: '종류',
};

export function suggestLabel(card: CustomKpiCard): string {
  const agg = card.aggregation;
  const fieldLabel = agg.field === '*' ? '전체' : agg.field;
  const aggLabel = AGG_LABEL[agg.agg];

  if (card.kind === 'total') {
    return `${fieldLabel} ${aggLabel}`;
  }

  // conditional
  const condSummary = (agg.conditions || [])
    .filter((c) => c.field && c.values.length > 0)
    .map((c) => {
      if (c.values.length === 1) return `${c.field}=${c.values[0]}`;
      return `${c.field}(${c.values.length})`;
    })
    .join(' · ');
  return condSummary ? `${condSummary} ${fieldLabel} ${aggLabel}` : `${fieldLabel} ${aggLabel}`;
}

// ---------------------------------------------------------------------------
// 자동 → 커스텀 마이그레이션
// ---------------------------------------------------------------------------

import type { ValueField } from './pivotEngine';

export function migrateAutoToCustom(values: ValueField[]): CustomKpiCard[] {
  return values.map((vf, i) => ({
    id: `auto-${Date.now()}-${i}`,
    kind: 'total' as const,
    label: `${vf.field} ${AGG_LABEL[vf.agg as ExtendedAggType] ?? vf.agg}`,
    aggregation: {
      field: vf.field,
      agg: vf.agg as ExtendedAggType,
    },
  }));
}

export function makeCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatKpiValue(n: number | null): string {
  if (n === null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}
