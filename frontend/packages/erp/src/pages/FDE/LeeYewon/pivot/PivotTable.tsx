import { useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColGroupDef,
  themeQuartz,
} from 'ag-grid-community';
import s from './PivotTable.module.css';
import { getCellValue, type PivotConfig, type PivotResult } from './pivotEngine';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: 'Pretendard, sans-serif',
  fontSize: 12,
  accentColor: '#5B5FC7',
  browserColorScheme: 'light',
  headerFontWeight: 600,
  headerBackgroundColor: '#F8F9FA',
  headerTextColor: '#374151',
  borderColor: '#E5E7EB',
  rowHoverColor: '#F9FAFB',
});

interface Props {
  result: PivotResult;
  config: PivotConfig;
}

function makeKey(parts: string[]): string {
  return parts.join('|||');
}

const numberFormatter = (p: { value: unknown }) =>
  typeof p.value === 'number' && !isNaN(p.value)
    ? p.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
    : '';

export default function PivotTable({ result, config }: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const rowFields = config.rows;
  const colFields = config.columns;
  const { values } = config;
  const hasRows = rowFields.length > 0;
  const hasCols = colFields.length > 0;
  const hasValues = values.length > 0;
  const showRowTotals = config.showRowTotals !== false; // 기본 true
  const showColTotals = config.showColTotals !== false; // 기본 true

  const { colDefs, rowData } = useMemo(() => {
    if (!hasValues) return { colDefs: [], rowData: [] };

    const effectiveColKeys = hasCols ? result.colKeys : [[] as string[]];
    const effectiveRowKeys = hasRows ? result.rowKeys : [[] as string[]];

    // --- 컬럼 정의 ---
    const rowColDefs: ColDef[] = rowFields.map((f) => ({
      field: `__row_${f}`,
      headerName: f,
      pinned: 'left' as const,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 120,
    }));

    const dataColDefs: (ColDef | ColGroupDef)[] = [];
    if (hasCols) {
      for (const ck of effectiveColKeys) {
        const groupHeader = ck.join(' / ');
        const children: ColDef[] = values.map((vf) => ({
          field: `${makeKey(ck)}__${vf.field}`,
          headerName: `${vf.field}(${vf.agg})`,
          type: 'numericColumn',
          valueFormatter: numberFormatter,
          sortable: true,
          filter: 'agNumberColumnFilter',
          resizable: true,
          minWidth: 110,
        }));
        dataColDefs.push({ headerName: groupHeader, children });
      }
      // 합계 그룹 (행 합계 = 각 행의 우측 합계)
      if (showRowTotals) {
        const totalChildren: ColDef[] = values.map((vf) => ({
          field: `__total__${vf.field}`,
          headerName: `${vf.field}(합계)`,
          type: 'numericColumn',
          valueFormatter: numberFormatter,
          sortable: true,
          filter: 'agNumberColumnFilter',
          resizable: true,
          minWidth: 110,
          cellStyle: { fontWeight: 600, color: '#5B5FC7' },
        }));
        dataColDefs.push({ headerName: '합계', children: totalChildren });
      }
    } else {
      // 열 없으면 값 컬럼 바로 배치
      for (const vf of values) {
        dataColDefs.push({
          field: `__val__${vf.field}`,
          headerName: `${vf.field} (${vf.agg})`,
          type: 'numericColumn',
          valueFormatter: numberFormatter,
          sortable: true,
          filter: 'agNumberColumnFilter',
          resizable: true,
          minWidth: 120,
        });
      }
    }

    const allColDefs: (ColDef | ColGroupDef)[] = [...rowColDefs, ...dataColDefs];

    // --- 로우 데이터 ---
    const rowData: Record<string, unknown>[] = [];

    for (const rk of effectiveRowKeys) {
      const row: Record<string, unknown> = {};
      rowFields.forEach((f, i) => {
        row[`__row_${f}`] = rk[i];
      });

      if (hasCols) {
        for (const ck of effectiveColKeys) {
          for (const vf of values) {
            row[`${makeKey(ck)}__${vf.field}`] = getCellValue(result, rk, ck, vf.field);
          }
        }
        if (showRowTotals) {
          for (const vf of values) {
            row[`__total__${vf.field}`] = result.rowTotals.get(`${makeKey(rk)}|${vf.field}`) ?? null;
          }
        }
      } else {
        for (const vf of values) {
          row[`__val__${vf.field}`] = getCellValue(result, rk, [], vf.field);
        }
      }

      rowData.push(row);
    }

    // 합계 행 (pinned bottom)
    return { colDefs: allColDefs, rowData };
  }, [result, config, hasRows, hasCols, hasValues, rowFields, colFields, values]);

  // 합계 행 (하단 고정) — 열 합계
  const pinnedBottomRowData = useMemo(() => {
    if (!hasValues || !hasRows || !showColTotals) return [];
    const totalRow: Record<string, unknown> = {};
    rowFields.forEach((f, i) => {
      totalRow[`__row_${f}`] = i === 0 ? '합계' : '';
    });

    if (hasCols) {
      for (const ck of result.colKeys) {
        for (const vf of values) {
          totalRow[`${makeKey(ck)}__${vf.field}`] =
            result.colTotals.get(`${makeKey(ck)}|${vf.field}`) ?? null;
        }
      }
      if (showRowTotals) {
        for (const vf of values) {
          totalRow[`__total__${vf.field}`] = result.grandTotals.get(vf.field) ?? null;
        }
      }
    } else {
      for (const vf of values) {
        totalRow[`__val__${vf.field}`] = result.grandTotals.get(vf.field) ?? null;
      }
    }
    return [totalRow];
  }, [result, config, hasRows, hasCols, hasValues, rowFields, values, showRowTotals, showColTotals]);

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true }),
    [],
  );

  const exportCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `pivot_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  };

  if (!hasValues) {
    return <p className={s.noData}>값(⑤) 영역에 필드를 배치하세요.</p>;
  }

  return (
    <div className={s.wrapper}>
      <div className={s.toolbar}>
        <span className={s.count}>{rowData.length.toLocaleString('ko-KR')}행</span>
        <button className={s.exportBtn} onClick={exportCsv}>CSV 다운로드</button>
      </div>
      <div className={s.gridWrap}>
        <AgGridReact
          ref={gridRef}
          theme={theme}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          pinnedBottomRowData={pinnedBottomRowData}
          animateRows={false}
          rowBuffer={20}
          getRowStyle={(params) => {
            if (params.node.rowPinned === 'bottom') {
              return { fontWeight: 600, background: '#F8F9FA' };
            }
            return undefined;
          }}
        />
      </div>
    </div>
  );
}
