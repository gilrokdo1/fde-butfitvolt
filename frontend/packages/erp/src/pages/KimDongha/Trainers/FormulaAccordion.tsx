import { useState } from 'react';
import type { TrainerCriteria } from '../../../api/fde';
import s from './Trainers.module.css';

interface Props {
  criteria: TrainerCriteria;
  inactiveWindow?: string;      // e.g. "2026-02 ~ 2026-04"
  excludedCount: number;
}

export default function FormulaAccordion({ criteria, inactiveWindow, excludedCount }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.formulaPanel}>
      <div className={s.formulaHeader} onClick={() => setOpen((v) => !v)}>
        <span className={s.formulaTitle}>📖 지표 정의 · 집계 수식 · 제외 규칙 {open ? '▲' : '▼'}</span>
        <span className={s.formulaHint}>
          {open ? '' : '데이터가 어떻게 계산되는지 확인하려면 클릭'}
        </span>
      </div>
      {open && (
        <div className={s.formulaBody}>
          <MetricBlock
            name="① 유효회원(월 평균)"
            source={'raw_data_pt (PT 멤버십 상세)'}
            definition="기간 내 각 월의 월말 시점에 유효한 정규 PT 멤버십 회원 수 (월별 집계 후 월 평균)."
            formula={[
              'per month: COUNT(DISTINCT 회원연락처)',
              'WHERE 체험정규 = "정규"',
              '  AND 멤버십시작일 ≤ 월말  AND 멤버십종료일 ≥ 월초',
              '  AND 총횟수 < 99999 (무제한 제외)',
              `period avg = SUM(월별 회원수) / ${criteria ? '기간 월 수' : 'N'}`,
            ]}
            columns={[
              ['체험정규', '"체험" | "정규" (raw_data_pt 내장 분류)'],
              ['멤버십시작일/종료일', '해당 멤버십의 유효 기간'],
              ['총횟수', '크레딧 기반 PT 횟수. 99999+ = 무제한 (엑스트라 트레이너·임직원권 성격)'],
              ['회원연락처', '고유 회원 식별자 (동일 회원이 여러 멤버십 보유해도 1명으로 카운트)'],
            ]}
            threshold={`기준: 월 평균 ≥ ${criteria.active_members_min}명`}
          />

          <MetricBlock
            name="② 월 세션(월 평균)"
            source={'raw_data_reservation (수업 예약)'}
            definition="기간 내 각 월의 출석 PT 세션 수 합 (월별 집계 후 월 평균)."
            formula={[
              'per month: COUNT(*)',
              'FROM raw_data_reservation',
              'WHERE 수업날짜 BETWEEN 월초 AND 월말',
              '  AND 예약취소 = "유지"',
              '  AND 출석여부 = "출석"',
              '  AND 멤버십명 ILIKE "%PT%"',
              '트레이너 귀속: 예약 레코드의 "트레이너" 컬럼 → user_user.name 조인 → user_btrainer.id',
              `period avg = SUM(월별 세션수) / 기간 월 수`,
            ]}
            columns={[
              ['수업날짜', '실제 수업 날짜'],
              ['예약취소', '"유지" | "취소" — 취소된 예약 제외'],
              ['출석여부', '"출석" | "결석" | "불일치" | "미확정" — 출석만 집계'],
              ['멤버십명', '상품명. PT 키워드 포함된 것만 (피트니스·요가 등 제외)'],
            ]}
            threshold={`기준: 월 평균 ≥ ${criteria.sessions_min}회`}
          />

          <MetricBlock
            name="③ 체험전환율 (기간 누적)"
            source={'raw_data_pt'}
            definition="기간 중 체험권이 종료된 회원 중 전환재등록 = '체험전환' 인 비율."
            formula={[
              '분자 = COUNT(DISTINCT 회원연락처) WHERE 체험정규="체험" AND 멤버십종료일 IN 기간 AND 전환재등록="체험전환"',
              '분모 = COUNT(DISTINCT 회원연락처) WHERE 체험정규="체험" AND 멤버십종료일 IN 기간',
              '체험전환율 = 분자 / 분모 × 100 (%)',
              '귀속 트레이너: 체험 멤버십의 담당트레이너 (user_user 이름 기반 매핑)',
            ]}
            columns={[
              ['전환재등록', '체험전환 / 미전환 / 재등록 / 휴면 / 미등록 (raw_data_pt 내장 판정)'],
              ['체험전환 판정', '체험 종료 후 30일 이내 정규 PT 구매 → "체험전환"'],
            ]}
            threshold={`기준: ≥ ${criteria.conversion_min}%`}
          />

          <MetricBlock
            name="④ 재등록률 (기간 누적)"
            source={'raw_data_pt'}
            definition="기간 중 정규 PT 멤버십이 만료된 회원 중 30일 내 '재등록' 멤버십을 시작한 비율."
            formula={[
              '분자 = 정규 만료자 중 contact이 (멤버십시작일 ∈ [기간초, 기간말+30일])인 정규·전환재등록="재등록" 멤버십을 보유한 회원 수',
              '분모 = COUNT(DISTINCT 회원연락처) WHERE 체험정규="정규" AND 멤버십종료일 IN 기간 AND 총횟수<99999',
              '재등록률 = 분자 / 분모 × 100 (%)',
              '귀속 트레이너: **이전(종료된)** 멤버십의 담당트레이너 (재계약을 유도한 주체)',
            ]}
            columns={[
              ['무제한 제외', '총횟수≥99999 회원은 분모/분자 모두 제외 (임직원권·특수계약)'],
              ['전환재등록="재등록"', '직전 정규 대비 30일 이내 신규 정규 결제 시 "재등록" 태깅'],
            ]}
            threshold={`기준: ≥ ${criteria.rereg_min}%`}
          />

          <div className={s.exclusionBlock}>
            <div className={s.metricName}>⚠️ 공통 제외 규칙</div>
            <ul className={s.formulaList}>
              <li>
                <b>환불 제외</b>: raw_data_pt의 <code>"결제상태"</code>가 <code>'전체환불'</code> 또는 <code>'환불'</code>인
                멤버십은 4개 지표 집계에서 제외 (재등록률·체험전환율 왜곡 방지).
                <span className={s.note}>'부분환불'은 실제 이용이 있었으므로 포함.</span>
              </li>
              <li>
                <b>직원(임직원) 제외</b>: <code>dongha_trainer_excluded</code> 테이블에 등록된 트레이너 이름은
                모든 집계에서 제외. 현재 {excludedCount}명 등록됨 (기준값 패널에서 관리).
              </li>
              <li>
                <b>계약 종료 추정 제외</b>: 최근 3개월({inactiveWindow ?? 'N/A'})에 월 세션 합계가 0인 트레이너는
                평가 대상에서 제외 (활동 중단·계약 종료로 간주).
              </li>
              <li>
                <b>무제한권 제외</b>: 유효회원·재등록 지표의 분모·분자에서 <code>총횟수 ≥ 99999</code>인
                멤버십은 제외 (임직원권·특수계약 성격).
              </li>
              <li>
                <b>중복 병합</b>: 동일 이름+동일 지점의 여러 <code>trainer_user_id</code>는 1행으로 합산 (레플리카
                DB에서 발생하는 동명이인·재등록 계정 중복을 자동 해소).
              </li>
            </ul>
          </div>

          <div className={s.metaBlock}>
            <div className={s.metricName}>📦 재계약 고려 판정</div>
            <div className={s.formulaList}>
              네 개 지표(유효회원/월 세션/체험전환율/재등록률) 중 미달 항목이 <b>{criteria.fail_threshold}</b>개 이상이면 "재계약 고려" 배지.
              전체 기준값은 상단 ⚙️ 패널에서 실시간 프리뷰로 조정 가능.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBlock({
  name,
  source,
  definition,
  formula,
  columns,
  threshold,
}: {
  name: string;
  source: string;
  definition: string;
  formula: string[];
  columns: Array<[string, string]>;
  threshold: string;
}) {
  return (
    <div className={s.metricBlock}>
      <div className={s.metricName}>{name}</div>
      <div className={s.metricMeta}>
        <span className={s.metricSource}>SOURCE: {source}</span>
        <span className={s.metricThreshold}>{threshold}</span>
      </div>
      <div className={s.metricDef}>{definition}</div>
      <pre className={s.formulaCode}>{formula.join('\n')}</pre>
      <table className={s.columnsTable}>
        <tbody>
          {columns.map(([col, desc], i) => (
            <tr key={i}>
              <td className={s.columnName}><code>{col}</code></td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
