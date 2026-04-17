/**
 * 피벗 계산 엔진
 * 로우 데이터 + 피벗 설정 → 교차 집계 결과
 */

export type AggType = 'SUM' | 'COUNT' | 'AVG';

export interface ValueField {
  field: string;
  agg: AggType;
}

export interface PivotConfig {
  rows: string[];
  columns: string[];
  values: ValueField[];
  filters: Record<string, string[]>; // field → 선택된 값 배열
  showRowTotals?: boolean;  // 행 합계(우측) 표시 — 기본 true
  showColTotals?: boolean;  // 열 합계(하단) 표시 — 기본 true
}

export interface PivotResult {
  rowKeys: string[][];       // 각 행의 키 조합
  colKeys: string[][];       // 각 열의 키 조합
  data: Map<string, number>; // "rowKey|colKey|valueField" → 집계값
  rowTotals: Map<string, number>;  // "rowKey|valueField" → 합계
  colTotals: Map<string, number>;  // "colKey|valueField" → 합계
  grandTotals: Map<string, number>; // "valueField" → 전체 합계
  counts: Map<string, number>;     // AVG 계산용 카운트
}

function makeKey(parts: string[]): string {
  return parts.join('|||');
}

function getFieldValue(row: Record<string, unknown>, field: string): string {
  const v = row[field];
  if (v === null || v === undefined) return '(없음)';
  return String(v);
}

function getNumericValue(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function uniqueSorted(keys: string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const k of keys) {
    const s = makeKey(k);
    if (!seen.has(s)) {
      seen.add(s);
      result.push(k);
    }
  }
  result.sort((a, b) => makeKey(a).localeCompare(makeKey(b)));
  return result;
}

export function computePivot(
  rawRows: Record<string, unknown>[],
  config: PivotConfig,
): PivotResult {
  // 필터 적용
  let filtered = rawRows;
  for (const [field, allowed] of Object.entries(config.filters)) {
    if (allowed.length > 0) {
      const set = new Set(allowed);
      filtered = filtered.filter((r) => set.has(getFieldValue(r, field)));
    }
  }

  const data = new Map<string, number>();
  const counts = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  const grandTotals = new Map<string, number>();
  const rowKeysAll: string[][] = [];
  const colKeysAll: string[][] = [];

  for (const row of filtered) {
    const rk = config.rows.map((f) => getFieldValue(row, f));
    const ck = config.columns.map((f) => getFieldValue(row, f));
    rowKeysAll.push(rk);
    colKeysAll.push(ck);

    const rkStr = makeKey(rk);
    const ckStr = makeKey(ck);

    for (const vf of config.values) {
      const num = vf.agg === 'COUNT' ? 1 : getNumericValue(row, vf.field);
      const cellKey = `${rkStr}|${ckStr}|${vf.field}`;
      const rowKey = `${rkStr}|${vf.field}`;
      const colKey = `${ckStr}|${vf.field}`;

      data.set(cellKey, (data.get(cellKey) || 0) + num);
      counts.set(cellKey, (counts.get(cellKey) || 0) + 1);

      rowTotals.set(rowKey, (rowTotals.get(rowKey) || 0) + num);
      colTotals.set(colKey, (colTotals.get(colKey) || 0) + num);
      grandTotals.set(vf.field, (grandTotals.get(vf.field) || 0) + num);

      // AVG용 카운트
      const rowCntKey = `${rowKey}__cnt`;
      const colCntKey = `${colKey}__cnt`;
      const grandCntKey = `${vf.field}__cnt`;
      counts.set(rowCntKey, (counts.get(rowCntKey) || 0) + 1);
      counts.set(colCntKey, (counts.get(colCntKey) || 0) + 1);
      counts.set(grandCntKey, (counts.get(grandCntKey) || 0) + 1);
    }
  }

  // AVG 후처리
  for (const vf of config.values) {
    if (vf.agg === 'AVG') {
      for (const [k, v] of data.entries()) {
        if (k.endsWith(`|${vf.field}`)) {
          const cnt = counts.get(k) || 1;
          data.set(k, v / cnt);
        }
      }
      for (const [k, v] of rowTotals.entries()) {
        if (k.endsWith(`|${vf.field}`)) {
          const cnt = counts.get(`${k}__cnt`) || 1;
          rowTotals.set(k, v / cnt);
        }
      }
      for (const [k, v] of colTotals.entries()) {
        if (k.endsWith(`|${vf.field}`)) {
          const cnt = counts.get(`${k}__cnt`) || 1;
          colTotals.set(k, v / cnt);
        }
      }
      const gv = grandTotals.get(vf.field) || 0;
      const gc = counts.get(`${vf.field}__cnt`) || 1;
      grandTotals.set(vf.field, gv / gc);
    }
  }

  return {
    rowKeys: uniqueSorted(rowKeysAll),
    colKeys: uniqueSorted(colKeysAll),
    data,
    rowTotals,
    colTotals,
    grandTotals,
    counts,
  };
}

export function getCellValue(
  result: PivotResult,
  rowKey: string[],
  colKey: string[],
  valueField: string,
): number | null {
  const k = `${makeKey(rowKey)}|${makeKey(colKey)}|${valueField}`;
  return result.data.get(k) ?? null;
}

export function getUniqueValues(
  rows: Record<string, unknown>[],
  field: string,
): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(getFieldValue(r, field));
  return Array.from(set).sort();
}
