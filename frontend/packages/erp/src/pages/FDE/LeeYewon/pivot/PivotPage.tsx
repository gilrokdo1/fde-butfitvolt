import { useState, useMemo, useCallback } from 'react';
import s from './PivotPage.module.css';
import QuerySelector from './QuerySelector';
import PivotPanel from './PivotPanel';
import PivotTable from './PivotTable';
import KpiBar from './KpiBar';
import RawDataTable from './RawDataTable';
import TemplateSelector from './TemplateSelector';
import { computePivot, getUniqueValues, type PivotConfig } from './pivotEngine';
import { useKpiPreset } from './useKpiPreset';
import { usePivotTemplates, type PivotTemplate } from './pivotTemplates';

const BASE_SQL = `SELECT
  item_master_id, item_master_name,
  item_id, is_mission_item, item_name, option_name, txid,
  paymonth, paydate, price, plate, quantity, place, pay_method, channel, user_id
FROM (
  SELECT
    -- 고정 상품 마스터 (이름 변경/변형에 영향 안 받음)
    e.local_item_detail_id AS item_master_id,
    det.name AS item_master_name,
    -- 트랜잭션 시점의 항목(지점·시점별로 다름)
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
  LEFT JOIN b_payment_blocalitemdetail det ON det.id = e.local_item_detail_id
  WHERE b.item_type = 'local_item'
    AND b.original_log_id IS NULL
    AND b.is_refund = false
    AND b.created >= '2025-08-28'
  ORDER BY b.created, c.name, b.id
) fnb`;

const DEFAULT_CONFIG: PivotConfig = {
  rows: ['item_master_name'],
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
  const [selectedQueryId, setSelectedQueryId] = useState<string>('default');
  const [panelOpen, setPanelOpen] = useState(true);

  const currentSql = customSql || BASE_SQL;

  // KPI 카드 프리셋 — 쿼리별로 localStorage에 저장
  const [kpiState, setKpiState] = useKpiPreset(selectedQueryId);

  // 템플릿 (쿼리 SQL + 피벗 설정 + KPI를 묶어 저장)
  const { templates, create: createTemplate, remove: removeTemplate, rename: renameTemplate } =
    usePivotTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const applyTemplate = useCallback((tpl: PivotTemplate) => {
    setCustomSql(tpl.sql === BASE_SQL ? null : tpl.sql);
    setSelectedQueryId(`template::${tpl.id}`);
    setConfig(tpl.pivotConfig);
    setKpiState(tpl.kpiPreset);
    setSelectedTemplateId(tpl.id);
    // 적용 후 자동 실행
    setLoaded(false);
    setTimeout(() => runQuery(), 0);
  }, [setKpiState]);

  const saveCurrentAsTemplate = useCallback((name: string) => {
    const tpl = createTemplate(name, {
      sql: currentSql,
      pivotConfig: config,
      kpiPreset: kpiState,
    });
    setSelectedTemplateId(tpl.id);
  }, [createTemplate, currentSql, config, kpiState]);

  const handleTemplateDelete = (id: string) => {
    removeTemplate(id);
    if (selectedTemplateId === id) setSelectedTemplateId(null);
  };

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

  const handleQuerySelect = (sql: string, queryId: string) => {
    setCustomSql(sql || null);
    setSelectedQueryId(queryId);
    setSelectedTemplateId(null); // 쿼리를 직접 바꾸면 템플릿 선택 해제
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

      <TemplateSelector
        templates={templates}
        selectedId={selectedTemplateId}
        onApply={applyTemplate}
        onSaveCurrent={saveCurrentAsTemplate}
        onDelete={handleTemplateDelete}
        onRename={renameTemplate}
      />

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
              {panelOpen ? (
                <PivotPanel
                  allFields={allFields}
                  config={config}
                  onChange={setConfig}
                  uniqueValues={uniqueValues}
                  onCollapse={() => setPanelOpen(false)}
                />
              ) : (
                <button
                  className={s.panelExpandBar}
                  onClick={() => setPanelOpen(true)}
                  title="필드 패널 펼치기"
                >
                  ▶
                </button>
              )}
              <div className={s.main}>
                <KpiBar
                  rawRows={rawRows}
                  allFields={allFields}
                  uniqueValues={uniqueValues}
                  autoValues={config.values}
                  totalRows={rawRows.length}
                  state={kpiState}
                  onStateChange={setKpiState}
                />
                {pivotResult && <PivotTable result={pivotResult} config={config} />}
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
