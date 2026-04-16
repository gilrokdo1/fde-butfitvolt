import { useState } from 'react';
import s from './PivotPage.module.css';
import PivotTable from './PivotTable';

const BASE_SQL = `WITH sales AS (
  SELECT
    b.item_info ->> 'name' AS item_name,
    b.item_info ->> 'option_name' AS option_name,
    to_char(b.created, 'YYYY-MM') AS paymonth,
    to_char(b.created, 'YYYY-MM-DD') AS paydate,
    b.item_price AS price,
    d.plate,
    CAST((b.item_info ->> 'quantity') AS INTEGER) AS quantity,
    c.name AS place,
    CASE
      WHEN b.pay_method IN ('iamport','kicc','nice')
           AND b.item_price > 0 THEN '카드결제'
      WHEN b.pay_method = 'plate'
           AND b.item_price = 0 AND d.plate > 0 THEN '플레이트'
      WHEN e.is_mission_item = TRUE
           AND d.plate = 0 AND b.item_price = 0 THEN '미션보상'
      WHEN e.is_mission_item = TRUE AND d.plate > 0 THEN '플레이트'
      ELSE b.pay_method
    END AS pay_method,
    CASE
      WHEN b.pay_type IN ('app_카드','app_쿠폰','app_플레이트','app_플레이트 ')
      THEN 'APP' ELSE '키오스크'
    END AS channel,
    d.user_id
  FROM b_payment_btransactionlog b
  LEFT JOIN b_class_bplace c ON b.b_place_id = c.id
  LEFT JOIN b_payment_btransaction d ON b.transaction_id = d.id
  LEFT JOIN b_payment_blocalitem e ON e.id = b.item_id
  WHERE b.item_type = 'local_item'
    AND b.original_log_id IS NULL
    AND b.is_refund = false
)
SELECT item_name, option_name, paymonth, paydate, price, plate, quantity, place, pay_method, channel, user_id
FROM sales
WHERE pay_method != '미션보상'
LIMIT 10000`;

export default function PivotPage() {
  const [sql] = useState(BASE_SQL);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/fde-api/pivot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `서버 오류 (${res.status})`);
      }
      const data = await res.json();
      setColumns(data.columns);
      setRows(data.rows);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿼리 실행 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={s.wrapper}>
      <div className={s.toolbar}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4CA;</span>
          B-Store 판매 피벗 분석
        </h2>
        <button className={s.runButton} onClick={runQuery} disabled={loading}>
          {loading ? '조회 중...' : loaded ? '새로고침' : '데이터 조회'}
        </button>
      </div>

      {error && <p className={s.error}>{error}</p>}

      {!loaded && !loading && !error && (
        <div className={s.empty}>
          <span style={{ fontFamily: 'Tossface', fontSize: 40 }}>&#x1F50D;</span>
          <p>조회 버튼을 눌러 B-Store 판매 데이터를 불러오세요</p>
        </div>
      )}

      {loaded && <PivotTable columns={columns} rows={rows} />}
    </section>
  );
}
