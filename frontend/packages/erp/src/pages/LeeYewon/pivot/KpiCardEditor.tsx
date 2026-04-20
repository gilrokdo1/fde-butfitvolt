import { useEffect, useMemo, useState } from 'react';
import s from './KpiCardEditor.module.css';
import {
  computeKpiCard,
  formatKpiValue,
  makeCardId,
  suggestLabel,
  type CustomKpiCard,
  type ExtendedAggType,
  type KpiAggregation,
  type KpiCondition,
} from './kpiCards';

interface Props {
  rawRows: Record<string, unknown>[];
  allFields: string[];
  uniqueValues: Record<string, string[]>;
  editing?: CustomKpiCard | null;
  onSave: (card: CustomKpiCard) => void;
  onClose: () => void;
}

type Kind = 'total' | 'conditional' | 'ratio' | 'topN';

const AGG_OPTIONS: { value: ExtendedAggType; label: string }[] = [
  { value: 'SUM', label: 'SUM 합계' },
  { value: 'COUNT', label: 'COUNT 건수' },
  { value: 'AVG', label: 'AVG 평균' },
  { value: 'MAX', label: 'MAX 최댓값' },
  { value: 'MIN', label: 'MIN 최솟값' },
  { value: 'DISTINCT', label: 'DISTINCT 종류 수' },
];

const COLOR_PALETTE = [
  { value: '', label: '없음', swatch: 'transparent' },
  { value: '#5B5FC7', label: '보라', swatch: '#5B5FC7' },
  { value: '#059669', label: '초록', swatch: '#059669' },
  { value: '#2563EB', label: '파랑', swatch: '#2563EB' },
  { value: '#DC2626', label: '빨강', swatch: '#DC2626' },
  { value: '#D97706', label: '주황', swatch: '#D97706' },
  { value: '#6B7280', label: '회색', swatch: '#6B7280' },
];

export default function KpiCardEditor({
  rawRows,
  allFields,
  uniqueValues,
  editing,
  onSave,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(editing ? 2 : 1);
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'total');
  const [aggregation, setAggregation] = useState<KpiAggregation>(() => {
    if (editing) return editing.aggregation;
    return { field: allFields[0] ?? '', agg: 'SUM' };
  });
  const [label, setLabel] = useState<string>(editing?.label ?? '');
  const [color, setColor] = useState<string>(editing?.color ?? '');

  // ESC로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // 카테고리 변경 시 조건 초기화
  const changeKind = (k: Kind) => {
    if (k === 'ratio' || k === 'topN') return; // Phase 2 비활성
    setKind(k);
    if (k === 'conditional') {
      setAggregation((a) => ({ ...a, conditions: a.conditions?.length ? a.conditions : [{ field: '', values: [] }] }));
    } else {
      setAggregation((a) => ({ ...a, conditions: [] }));
    }
  };

  // 미리보기 카드 객체
  const previewCard: CustomKpiCard = useMemo(() => {
    const base = {
      id: editing?.id ?? 'preview',
      label: label || suggestLabel({ id: 'p', kind, label: '', aggregation } as CustomKpiCard),
      color: color || undefined,
      aggregation,
    };
    if (kind === 'conditional') {
      return { ...base, kind: 'conditional' };
    }
    return { ...base, kind: 'total' };
  }, [kind, aggregation, label, color, editing]);

  const previewResult = useMemo(
    () => computeKpiCard(rawRows, previewCard, allFields),
    [rawRows, previewCard, allFields],
  );

  // 조건 관리
  const addCondition = () => {
    setAggregation((a) => ({
      ...a,
      conditions: [...(a.conditions ?? []), { field: '', values: [] }],
    }));
  };
  const updateCondition = (idx: number, patch: Partial<KpiCondition>) => {
    setAggregation((a) => ({
      ...a,
      conditions: (a.conditions ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };
  const removeCondition = (idx: number) => {
    setAggregation((a) => ({
      ...a,
      conditions: (a.conditions ?? []).filter((_, i) => i !== idx),
    }));
  };

  // Step 2 유효성
  const step2Valid = useMemo(() => {
    if (aggregation.agg === 'COUNT' && aggregation.field === '*') return true;
    if (!aggregation.field) return false;
    if (kind === 'conditional') {
      const valid = (aggregation.conditions ?? []).filter(
        (c) => c.field && c.values.length > 0,
      );
      if (valid.length === 0) return false;
    }
    return true;
  }, [aggregation, kind]);

  const handleSave = () => {
    if (!step2Valid) return;
    const finalLabel = label.trim() || suggestLabel({
      id: 'x',
      kind,
      label: '',
      aggregation,
    } as CustomKpiCard);
    const card: CustomKpiCard = {
      id: editing?.id ?? makeCardId(),
      kind: kind === 'conditional' ? 'conditional' : 'total',
      label: finalLabel,
      color: color || undefined,
      aggregation,
    };
    onSave(card);
  };

  const nextStep = () => {
    if (step === 1) setStep(2);
    else if (step === 2 && step2Valid) setStep(3);
  };
  const prevStep = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(editing ? 2 : 1); // 편집 모드는 1단계로 못 돌아감
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <h3 className={s.title}>{editing ? '카드 수정' : '새 카드 추가'}</h3>
          <div className={s.stepper}>
            {!editing && (
              <>
                <span className={`${s.stepDot} ${step >= 1 ? s.stepActive : ''}`}>① 종류</span>
                <span className={s.stepArrow}>→</span>
              </>
            )}
            <span className={`${s.stepDot} ${step >= 2 ? s.stepActive : ''}`}>② 설정</span>
            <span className={s.stepArrow}>→</span>
            <span className={`${s.stepDot} ${step >= 3 ? s.stepActive : ''}`}>③ 이름</span>
          </div>
        </div>

        <div className={s.body}>
          {step === 1 && (
            <div className={s.kindGrid}>
              <button
                className={`${s.kindCard} ${kind === 'total' ? s.kindActive : ''}`}
                onClick={() => changeKind('total')}
              >
                <span className={s.kindIcon} style={{ fontFamily: 'Tossface' }}>&#x1F522;</span>
                <span className={s.kindName}>전체 집계</span>
                <span className={s.kindDesc}>모든 데이터의 합/평균/개수</span>
              </button>
              <button
                className={`${s.kindCard} ${kind === 'conditional' ? s.kindActive : ''}`}
                onClick={() => changeKind('conditional')}
              >
                <span className={s.kindIcon} style={{ fontFamily: 'Tossface' }}>&#x1F3AF;</span>
                <span className={s.kindName}>조건부 집계</span>
                <span className={s.kindDesc}>특정 조건만 걸러서 집계</span>
              </button>
              <button
                className={`${s.kindCard} ${s.kindDisabled}`}
                disabled
                title="곧 추가 예정"
              >
                <span className={s.kindIcon} style={{ fontFamily: 'Tossface' }}>&#x1F4CA;</span>
                <span className={s.kindName}>비율 / 퍼센트</span>
                <span className={s.kindDesc}>A ÷ B × 100%</span>
                <span className={s.comingSoon}>곧 추가</span>
              </button>
              <button
                className={`${s.kindCard} ${s.kindDisabled}`}
                disabled
                title="곧 추가 예정"
              >
                <span className={s.kindIcon} style={{ fontFamily: 'Tossface' }}>&#x1F3C6;</span>
                <span className={s.kindName}>Top N</span>
                <span className={s.kindDesc}>상위 N개 그룹 이름 + 값</span>
                <span className={s.comingSoon}>곧 추가</span>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className={s.settings}>
              <div className={s.formRow}>
                <label className={s.formLabel}>필드</label>
                <select
                  className={s.select}
                  value={aggregation.field}
                  onChange={(e) => setAggregation((a) => ({ ...a, field: e.target.value }))}
                >
                  {aggregation.agg === 'COUNT' && <option value="*">* (전체 행)</option>}
                  {allFields.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className={s.formRow}>
                <label className={s.formLabel}>집계 방식</label>
                <select
                  className={s.select}
                  value={aggregation.agg}
                  onChange={(e) => {
                    const newAgg = e.target.value as ExtendedAggType;
                    setAggregation((a) => ({
                      ...a,
                      agg: newAgg,
                      // COUNT로 바꿀 때 field가 비어있으면 '*' 세팅
                      field: newAgg === 'COUNT' && !a.field ? '*' : a.field,
                    }));
                  }}
                >
                  {AGG_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {kind === 'conditional' && (
                <div className={s.conditionsBlock}>
                  <div className={s.conditionsHeader}>
                    <span className={s.formLabel}>조건 (AND)</span>
                    <button className={s.addConditionBtn} onClick={addCondition}>
                      + 조건 추가
                    </button>
                  </div>
                  {(aggregation.conditions ?? []).map((cond, idx) => (
                    <ConditionRow
                      key={idx}
                      condition={cond}
                      allFields={allFields}
                      uniqueValues={uniqueValues}
                      onChange={(patch) => updateCondition(idx, patch)}
                      onRemove={() => removeCondition(idx)}
                    />
                  ))}
                </div>
              )}

              <div className={s.preview}>
                <span className={s.previewLabel}>미리보기</span>
                <span className={s.previewValue}>
                  {previewResult.error
                    ? previewResult.error
                    : formatKpiValue(previewResult.value)}
                </span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={s.settings}>
              <div className={s.formRow}>
                <label className={s.formLabel}>이름</label>
                <input
                  className={s.input}
                  value={label}
                  placeholder={suggestLabel(previewCard)}
                  onChange={(e) => setLabel(e.target.value)}
                  autoFocus
                />
                <span className={s.hint}>비워두면 자동 이름이 사용됩니다: {suggestLabel(previewCard)}</span>
              </div>

              <div className={s.formRow}>
                <label className={s.formLabel}>색상</label>
                <div className={s.colorRow}>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.value}
                      className={`${s.colorSwatch} ${color === c.value ? s.colorActive : ''}`}
                      style={{
                        background: c.swatch === 'transparent' ? 'white' : c.swatch,
                        border: c.swatch === 'transparent' ? '1px dashed #D1D5DB' : 'none',
                      }}
                      title={c.label}
                      onClick={() => setColor(c.value)}
                    />
                  ))}
                </div>
              </div>

              <div className={s.preview}>
                <span className={s.previewLabel}>미리보기</span>
                <span className={s.previewValue}>
                  {previewResult.error
                    ? previewResult.error
                    : formatKpiValue(previewResult.value)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={s.footer}>
          {step > 1 && !editing && (
            <button className={s.secondaryBtn} onClick={prevStep}>이전</button>
          )}
          <div className={s.footerRight}>
            <button className={s.secondaryBtn} onClick={onClose}>취소</button>
            {step < 3 ? (
              <button
                className={s.primaryBtn}
                onClick={nextStep}
                disabled={step === 2 && !step2Valid}
              >
                다음
              </button>
            ) : (
              <button className={s.primaryBtn} onClick={handleSave}>
                {editing ? '수정' : '저장'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 조건 행 — FilterZone 패턴 단순화 버전
// ---------------------------------------------------------------------------

function ConditionRow({
  condition,
  allFields,
  uniqueValues,
  onChange,
  onRemove,
}: {
  condition: KpiCondition;
  allFields: string[];
  uniqueValues: Record<string, string[]>;
  onChange: (patch: Partial<KpiCondition>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const values = uniqueValues[condition.field] || [];
  const filtered = search
    ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : values;

  return (
    <div className={s.conditionRow}>
      <select
        className={s.select}
        value={condition.field}
        onChange={(e) => onChange({ field: e.target.value, values: [] })}
      >
        <option value="">필드 선택</option>
        {allFields.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <button
        className={s.valueSummaryBtn}
        onClick={() => setOpen((o) => !o)}
        disabled={!condition.field}
      >
        {condition.values.length === 0
          ? '값 선택'
          : condition.values.length === 1
            ? condition.values[0]
            : `${condition.values.length}개 선택`}
      </button>

      <button className={s.removeBtn} onClick={onRemove} title="조건 삭제">×</button>

      {open && condition.field && (
        <div className={s.valueDropdown}>
          <input
            className={s.valueSearch}
            placeholder={`검색 (${values.length}개)`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={s.valueActions}>
            <button className={s.valueActionBtn} onClick={() => onChange({ values: [] })}>
              전체 해제
            </button>
            <button className={s.valueActionBtn} onClick={() => onChange({ values })}>
              전체 선택
            </button>
          </div>
          <div className={s.valueList}>
            {filtered.map((v) => {
              const checked = condition.values.includes(v);
              return (
                <label key={v} className={s.valueOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange({ values: [...condition.values, v] });
                      } else {
                        onChange({ values: condition.values.filter((x) => x !== v) });
                      }
                    }}
                  />
                  {v}
                </label>
              );
            })}
            {filtered.length === 0 && <span className={s.valueEmpty}>결과 없음</span>}
          </div>
        </div>
      )}
    </div>
  );
}
