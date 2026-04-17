import { useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  themeQuartz,
} from 'ag-grid-community';
import s from './RawDataTable.module.css';

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
  columns: string[];
  rows: Record<string, unknown>[];
}

const NUMBER_FIELDS = new Set(['price', 'plate', 'quantity']);

export default function RawDataTable({ columns, rows }: Props) {
  const gridRef = useRef<AgGridReact>(null);

  const colDefs: ColDef[] = useMemo(
    () =>
      columns.map((col) => ({
        field: col,
        headerName: col,
        sortable: true,
        filter: true,
        resizable: true,
        ...(NUMBER_FIELDS.has(col)
          ? {
              type: 'numericColumn',
              valueFormatter: (p: { value: unknown }) =>
                typeof p.value === 'number' ? p.value.toLocaleString('ko-KR') : String(p.value ?? ''),
            }
          : {}),
      })),
    [columns],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
    }),
    [],
  );

  const exportCsv = () => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `raw_data_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  };

  if (rows.length === 0) {
    return <p className={s.noData}>데이터가 없습니다.</p>;
  }

  return (
    <div className={s.wrapper}>
      <div className={s.toolbar}>
        <span className={s.count}>{rows.length.toLocaleString('ko-KR')}건</span>
        <button className={s.exportBtn} onClick={exportCsv}>CSV 다운로드</button>
      </div>
      <div className={s.gridWrap}>
        <AgGridReact
          ref={gridRef}
          theme={theme}
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          animateRows={false}
          rowBuffer={20}
          suppressColumnVirtualisation={false}
        />
      </div>
    </div>
  );
}
