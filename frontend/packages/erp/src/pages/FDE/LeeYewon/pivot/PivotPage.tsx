import { useState, useMemo, useCallback } from 'react';
import s from './PivotPage.module.css';
import QuerySelector from './QuerySelector';
import PivotPanel from './PivotPanel';
import PivotTable from './PivotTable';
import KpiBar from './KpiBar';
import RawDataTable from './RawDataTable';
import { computePivot, getUniqueValues, type PivotConfig } from './pivotEngine';

const BASE_SQL = `SELECT
  item_id, is_mission_item, item_name, option_name, txid,
  paymonth, paydate, price, plate, quantity, place, pay_method, channel, user_id
FROM (
  SELECT
    b.item_info ->> 'id' AS item_id,
    e.is_mission_item,
    b.item_info ->> 'name' AS item_name,
    b.item_info ->> 'option_name' AS option_name,
    b.id AS txid,
    to_char(b.created, 'YYYY-MM') AS paymonth,
    to_char(b.created, 'YYYY-MM-DD (Dy)') AS paydate,
    b.item_price AS price,
    d.plate,
    CAST((b.item_info ->> 'quantity') AS INTEGER) AS quantity,
    c.name AS place,
    CASE
      WHEN b.pay_method IN ('iamport','kicc','nice') AND b.item_price > 0 THEN '카드결제'
      WHEN b.pay_method IN ('plate') AND b.item_price = 0 AND d.plate > 0 THEN '플레이트'
      WHEN e.is_mission_item = TRUE AND d.plate = 0 AND b.item_price = 0 THEN '미션보상'
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
    AND b.created >= '2025-08-28'
  ORDER BY b.created, c.name, b.id
) fnb`;

const DEFAULT_CONFIG: PivotConfig = {
  rows: ['item_name'],
  columns: ['paymonth'],
  values: [{ field: 'price', agg: 'SUM' }],
  filters: {},
};

type Tab = 'pivot' | 'raw';

export default function PivotPage() {
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [config, setConfig] = useState<PivotConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('pivot');
  const [activeSql, setActiveSql] = useState(BASE_SQL);
  const [customSql, setCustomSql] = useState<string | null>(null);

  const currentSql = customSql || BASE_SQL;

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/fde-api/pivot/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sql: currentSql }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `서버 오류 (${res.status})`);
      }
      const data = await res.json();
      setAllFields(data.columns);
      setRawRows(data.rows);
      setActiveSql(currentSql);
      setLoaded(true);
      // 새 쿼리면 기본 피벗 설정 리셋
      if (customSql) {
        setConfig({
          rows: [],
          columns: [],
          values: [],
          filters: {},
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '쿼리 실행 실패');
    } finally {
      setLoading(false);
    }
  }, [currentSql, customSql]);

  const handleQuerySelect = (sql: string) => {
    setCustomSql(sql || null);
  };

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of allFields) {
      map[f] = getUniqueValues(rawRows, f);
    }
    return map;
  }, [rawRows, allFields]);

  const pivotResult = useMemo(() => {
    if (rawRows.length === 0 || config.values.length === 0) return null;
    return computePivot(rawRows, config);
  }, [rawRows, config]);

  return (
    <section className={s.wrapper}>
      <h2 className={s.pageTitle}>
        <span style={{ fontFamily: 'Tossface' }}>&#x1F4CA;</span>
        데이터 피벗
      </h2>

      <QuerySelector
        currentSql={activeSql}
        onSelect={handleQuerySelect}
        onRunQuery={runQuery}
      />

      {error && <p className={s.error}>{error}</p>}

      {!loaded && !loading && !error && (
        <div className={s.empty}>
          <span style={{ fontFamily: 'Tossface', fontSize: 40 }}>&#x1F50D;</span>
          <p>쿼리를 선택하고 실행 버튼을 누르세요</p>
          <p className={s.emptyHint}>데이터를 불러온 후 피벗 설정을 자유롭게 조정할 수 있습니다</p>
        </div>
      )}

      {loading && (
        <div className={s.empty}>
          <p>데이터 조회 중...</p>
        </div>
      )}

      {loaded && !loading && (
        <>
          <div className={s.tabs}>
            <button
              className={`${s.tab} ${tab === 'pivot' ? s.tabActive : ''}`}
              onClick={() => setTab('pivot')}
            >
              피벗 테이블
            </button>
            <button
              className={`${s.tab} ${tab === 'raw' ? s.tabActive : ''}`}
              onClick={() => setTab('raw')}
            >
              로우 데이터
            </button>
          </div>

          {tab === 'pivot' && (
            <div className={s.body}>
              <PivotPanel
                allFields={allFields}
                config={config}
                onChange={setConfig}
                uniqueValues={uniqueValues}
              />
              <div className={s.main}>
                {pivotResult && (
                  <>
                    <KpiBar result={pivotResult} values={config.values} totalRows={rawRows.length} />
                    <PivotTable result={pivotResult} config={config} />
                  </>
                )}
                {!pivotResult && (
                  <div className={s.emptyInline}>
                    <p>좌측 패널에서 값(⑤)에 숫자 필드를 배치하세요</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'raw' && (
            <RawDataTable columns={allFields} rows={rawRows} />
          )}
        </>
      )}
    </section>
  );
}
