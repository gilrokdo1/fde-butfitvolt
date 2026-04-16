import s from './PivotTable.module.css';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
}

const NUMBER_FIELDS = new Set(['price', 'plate', 'quantity']);

function formatValue(col: string, val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (NUMBER_FIELDS.has(col) && typeof val === 'number') {
    return val.toLocaleString('ko-KR');
  }
  return String(val);
}

export default function PivotTable({ columns, rows }: Props) {
  if (rows.length === 0) {
    return <p className={s.noData}>데이터가 없습니다.</p>;
  }

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>#</th>
            {columns.map((col) => (
              <th key={col} className={`${s.th} ${NUMBER_FIELDS.has(col) ? s.right : ''}`}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={s.tr}>
              <td className={s.td}>{i + 1}</td>
              {columns.map((col) => (
                <td key={col} className={`${s.td} ${NUMBER_FIELDS.has(col) ? s.right : ''}`}>
                  {formatValue(col, row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={s.count}>{rows.toLocaleString()} 건 조회됨</p>
    </div>
  );
}
