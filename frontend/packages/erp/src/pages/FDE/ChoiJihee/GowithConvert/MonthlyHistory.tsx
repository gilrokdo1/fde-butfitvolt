import { useState, useEffect, useMemo } from 'react';
import type { RowData, MonthData, NonDeductibleOverrides, Employee } from './types';
import s from './MonthlyHistory.module.css';

// ── Storage keys ──────────────────────────────────────────────
const EMPLOYEES_KEY = 'gowith_employees';
const OVERRIDES_KEY = (ym: string) => `gowith_overrides_${ym}`;
const CLOSED_KEY = 'gowith_closed_months';
const DATA_KEY = (ym: string) => `gowith_data_${ym}`;

// ── Helpers ───────────────────────────────────────────────────
function loadEmployees(): Employee[] {
  try { return JSON.parse(localStorage.getItem(EMPLOYEES_KEY) ?? '[]'); } catch { return []; }
}
function loadClosedMonths(): string[] {
  try { return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]'); } catch { return []; }
}
function loadOverrides(ym: string): NonDeductibleOverrides {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY(ym)) ?? '{}'); } catch { return {}; }
}
function loadAvailableMonths(): string[] {
  const months: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('gowith_data_')) months.push(key.replace('gowith_data_', ''));
  }
  return months.sort().reverse();
}
function computeEffective(row: RowData, override?: boolean): boolean {
  if (override !== undefined) return override;
  if (row.domesticForeign === '국외') return true;
  if (row.businessType.includes('간이')) return true;
  return row.nonDeductible;
}
function fmt(n: number) { return n.toLocaleString('ko-KR'); }
function fmtYM(ym: string) {
  return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4, 6))}월`;
}
function cardLast4(cardNumber: string) {
  return cardNumber.replace(/[\s\-]/g, '').slice(-4);
}

// ── Types ─────────────────────────────────────────────────────
interface DisplayRow extends RowData {
  effectiveNonDeductible: boolean;
}
type FilterValues = Record<string, string>;

// ── Sub-components ────────────────────────────────────────────
function SummaryCard({ label, value, variant }: { label: string; value: number; variant?: string }) {
  return (
    <div className={`${s.summaryCard} ${variant ? s[variant] : ''}`}>
      <p className={s.summaryLabel}>{label}</p>
      <p className={s.summaryValue}>{fmt(value)}원</p>
    </div>
  );
}

interface AddSubmitterModalProps {
  submitterName: string;
  onClose: () => void;
  onSave: (emp: Omit<Employee, 'id'>) => void;
}
function AddSubmitterModal({ submitterName, onClose, onSave }: AddSubmitterModalProps) {
  const [code, setCode] = useState('');
  const [branch, setBranch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!code.trim()) errs.code = '소속코드를 입력해주세요.';
    if (!branch.trim()) errs.branch = '팀/지점명을 입력해주세요.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave({ name: submitterName, code: code.trim().toUpperCase(), branch: branch.trim() });
  };

  return (
    <div className={s.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h3 className={s.modalTitle}>미인식 제출자 등록</h3>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={s.modalForm}>
          <div className={s.modalField}>
            <label className={s.modalLabel}>이름</label>
            <input className={s.modalInputReadonly} value={submitterName} readOnly />
          </div>
          <div className={s.modalField}>
            <label className={s.modalLabel}>소속코드</label>
            <input
              className={`${s.modalInput} ${errors.code ? s.inputError : ''}`}
              value={code}
              onChange={(e) => { setCode(e.target.value); setErrors((p) => ({ ...p, code: '' })); }}
              placeholder="예: A001, C007"
              autoFocus
            />
            {errors.code && <p className={s.fieldError}>{errors.code}</p>}
          </div>
          <div className={s.modalField}>
            <label className={s.modalLabel}>팀/지점</label>
            <input
              className={`${s.modalInput} ${errors.branch ? s.inputError : ''}`}
              value={branch}
              onChange={(e) => { setBranch(e.target.value); setErrors((p) => ({ ...p, branch: '' })); }}
              placeholder="예: 역삼ARC, 마케팅실"
            />
            {errors.branch && <p className={s.fieldError}>{errors.branch}</p>}
          </div>
          <p className={s.modalNote}>
            적용 시 임직원 소속 메뉴에 자동 반영됩니다.
          </p>
          <div className={s.modalActions}>
            <button type="button" className={s.cancelBtn} onClick={onClose}>취소</button>
            <button type="submit" className={s.saveBtn}>적용</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function MonthlyHistory() {
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [overrides, setOverrides] = useState<NonDeductibleOverrides>({});
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState<FilterValues>({});
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [closeToast, setCloseToast] = useState('');

  const showToast = (msg: string) => {
    setCloseToast(msg);
    setTimeout(() => setCloseToast(''), 3000);
  };

  // 초기 로드
  useEffect(() => {
    const months = loadAvailableMonths();
    setAvailableMonths(months);
    if (months.length > 0) setSelectedMonth(months[0] ?? '');
    setClosedMonths(loadClosedMonths());
    setEmployees(loadEmployees());
  }, []);

  // 월 변경 시 데이터 로드
  useEffect(() => {
    if (!selectedMonth) return;
    try {
      const raw = localStorage.getItem(DATA_KEY(selectedMonth));
      setMonthData(raw ? JSON.parse(raw) : null);
      setOverrides(loadOverrides(selectedMonth));
    } catch {
      setMonthData(null);
      setOverrides({});
    }
    setFilters({});
  }, [selectedMonth]);

  const isClosed = closedMonths.includes(selectedMonth);

  // 연도/월 셀렉터용
  const years = useMemo(
    () => [...new Set(availableMonths.map((m) => m.slice(0, 4)))].sort().reverse(),
    [availableMonths],
  );
  const selectedYear = selectedMonth.slice(0, 4);
  const monthsForYear = useMemo(
    () => availableMonths.filter((m) => m.startsWith(selectedYear)),
    [availableMonths, selectedYear],
  );

  // 직원 맵
  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.name, e));
    return map;
  }, [employees]);

  // 표시 행 (effectiveNonDeductible 포함)
  const rows: DisplayRow[] = useMemo(() => {
    if (!monthData) return [];
    return monthData.rows.map((row) => ({
      ...row,
      effectiveNonDeductible: computeEffective(row, overrides[row.id]),
    }));
  }, [monthData, overrides]);

  // 미인식 제출자
  const unknownSubmitters = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.submitter).filter(Boolean))];
    return names.filter((n) => !empMap.has(n));
  }, [rows, empMap]);

  // 요약 (전체 행 기준)
  const summary = useMemo(() => {
    const total = rows.reduce((acc, r) => acc + r.amount, 0);
    const deductible = rows.filter((r) => !r.effectiveNonDeductible).reduce((acc, r) => acc + r.amount, 0);
    const nonDeductible = rows.filter((r) => r.effectiveNonDeductible).reduce((acc, r) => acc + r.amount, 0);
    return { total, deductible, nonDeductible };
  }, [rows]);

  // 필터 적용 행
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const emp = empMap.get(row.submitter);
      for (const [col, val] of Object.entries(filters)) {
        if (!val) continue;
        if (col === 'nonDeductible') {
          if (val === '공제' && row.effectiveNonDeductible) return false;
          if (val === '불공제' && !row.effectiveNonDeductible) return false;
          continue;
        }
        let cell = '';
        switch (col) {
          case 'branch':          cell = emp?.branch ?? ''; break;
          case 'usageDate':       cell = row.usageDate; break;
          case 'cardInfo':        cell = `${row.cardCompany} ${cardLast4(row.cardNumber)}`; break;
          case 'cardNickname':    cell = row.cardNickname; break;
          case 'approvalNumber':  cell = row.approvalNumber; break;
          case 'amount':          cell = String(row.amount); break;
          case 'submitter':       cell = row.submitter; break;
          case 'accountSubject':  cell = row.accountSubject; break;
          case 'approvedAmount':  cell = String(row.approvedAmount); break;
          case 'rejectedAmount':  cell = String(row.rejectedAmount); break;
          case 'memo':            cell = row.memo; break;
        }
        if (!cell.toLowerCase().includes(val.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filters, empMap]);

  const setFilter = (col: string, val: string) =>
    setFilters((prev) => ({ ...prev, [col]: val }));

  // 마감 토글
  const handleToggleClose = () => {
    if (isClosed) {
      const updated = closedMonths.filter((m) => m !== selectedMonth);
      setClosedMonths(updated);
      localStorage.setItem(CLOSED_KEY, JSON.stringify(updated));
    } else {
      const updated = [...closedMonths, selectedMonth];
      setClosedMonths(updated);
      localStorage.setItem(CLOSED_KEY, JSON.stringify(updated));
      // TODO: 3번 엑셀 다운로드 연결 예정
      showToast(`${fmtYM(selectedMonth)} 마감 완료. (엑셀 다운로드 기능 준비 중)`);
    }
  };

  // 공제/불공제 변경
  const handleNonDeductibleChange = (rowId: string, value: boolean) => {
    if (isClosed) {
      alert('이미 마감된 월입니다. 수정하려면 마감을 해제해주세요.');
      return;
    }
    const updated = { ...overrides, [rowId]: value };
    setOverrides(updated);
    localStorage.setItem(OVERRIDES_KEY(selectedMonth), JSON.stringify(updated));
  };

  // 제출자 추가
  const handleAddSubmitter = (data: Omit<Employee, 'id'>) => {
    const newEmp: Employee = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...data,
    };
    const updated = [...employees, newEmp];
    setEmployees(updated);
    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(updated));
    setAddTarget(null);
  };

  // ── 렌더 ───────────────────────────────────────────────────
  if (availableMonths.length === 0) {
    return (
      <div className={s.empty}>
        <span style={{ fontFamily: 'Tossface', fontSize: 40 }}>📋</span>
        <p>업로드된 데이터가 없습니다.</p>
        <p className={s.emptyHint}>Raw Data &gt; 엑셀 업로드에서 파일을 먼저 업로드해주세요.</p>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      {/* ── 헤더 영역 ── */}
      <div className={s.topBar}>
        <div className={s.selectors}>
          <select
            className={s.select}
            value={selectedYear}
            onChange={(e) => {
              const newYear = e.target.value;
              const newMonths = availableMonths.filter((m) => m.startsWith(newYear));
              if (newMonths.length > 0) setSelectedMonth(newMonths[0] ?? '');
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            className={s.select}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthsForYear.map((m) => (
              <option key={m} value={m}>{parseInt(m.slice(4, 6))}월</option>
            ))}
          </select>
          {isClosed && <span className={s.closedBadge}>마감됨</span>}
        </div>
        <button
          className={`${s.closeBtn} ${isClosed ? s.closeBtnUnlock : ''}`}
          onClick={handleToggleClose}
          disabled={!monthData}
        >
          {isClosed ? '마감 해제' : '마감'}
        </button>
      </div>

      {/* ── 요약 카드 ── */}
      {monthData && (
        <div className={s.summaryRow}>
          <SummaryCard label="총합계" value={summary.total} />
          <SummaryCard label="공제 합계" value={summary.deductible} variant="deductible" />
          <SummaryCard label="불공제 합계" value={summary.nonDeductible} variant="nonDeductible" />
        </div>
      )}

      {/* ── 미인식 제출자 배너 ── */}
      {unknownSubmitters.length > 0 && (
        <div className={s.unknownBanner}>
          <span className={s.unknownIcon}>⚠️</span>
          <span className={s.unknownText}>
            임직원 소속 미등록: {unknownSubmitters.join(', ')}
          </span>
          <div className={s.unknownBtns}>
            {unknownSubmitters.map((name) => (
              <button
                key={name}
                className={s.unknownBtn}
                onClick={() => setAddTarget(name)}
              >
                {name} 등록
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 데이터 없음 ── */}
      {!monthData && (
        <div className={s.empty}>
          <span style={{ fontFamily: 'Tossface', fontSize: 36 }}>📂</span>
          <p>{fmtYM(selectedMonth)} 데이터가 없습니다.</p>
          <p className={s.emptyHint}>엑셀 업로드 탭에서 해당 월 파일을 업로드해주세요.</p>
        </div>
      )}

      {/* ── 테이블 ── */}
      {monthData && (
        <>
          <div className={s.tableInfo}>
            전체 {rows.length}건 / 필터 {filteredRows.length}건
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.headerRow}>
                  {[
                    { id: 'seq',            label: '번호',    filterable: false },
                    { id: 'branch',         label: '지점명',   filterable: true },
                    { id: 'usageDate',      label: '사용일자', filterable: true },
                    { id: 'cardInfo',       label: '카드구분', filterable: true },
                    { id: 'cardNickname',   label: '카드별칭', filterable: true },
                    { id: 'approvalNumber', label: '승인번호', filterable: true },
                    { id: 'amount',         label: '이용금액', filterable: true },
                    { id: 'submitter',      label: '제출자',   filterable: true },
                    { id: 'accountSubject', label: '계정과목', filterable: true },
                    { id: 'approvedAmount', label: '승인금액', filterable: true },
                    { id: 'rejectedAmount', label: '반려금액', filterable: true },
                    { id: 'memo',           label: '메모',    filterable: true },
                    { id: 'nonDeductible',  label: '공제구분', filterable: true, isSelect: true },
                  ].map((col) => (
                    <th key={col.id} className={`${s.th} ${s[`col_${col.id}`] ?? ''}`}>
                      <span className={s.thLabel}>{col.label}</span>
                      {col.filterable && !col.isSelect && (
                        <input
                          className={s.filterInput}
                          value={filters[col.id] ?? ''}
                          onChange={(e) => setFilter(col.id, e.target.value)}
                          placeholder="필터"
                        />
                      )}
                      {col.isSelect && (
                        <select
                          className={s.filterSelect}
                          value={filters[col.id] ?? ''}
                          onChange={(e) => setFilter(col.id, e.target.value)}
                        >
                          <option value="">전체</option>
                          <option value="공제">공제</option>
                          <option value="불공제">불공제</option>
                        </select>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className={s.emptyRow}>필터 조건에 맞는 항목이 없습니다.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const emp = empMap.get(row.submitter);
                    const isUnknown = !emp && !!row.submitter;
                    return (
                      <tr key={row.id} className={s.tr}>
                        <td className={`${s.td} ${s.tdCenter}`}>{idx + 1}</td>
                        <td className={s.td}>
                          {isUnknown ? (
                            <button
                              className={s.unknownCell}
                              onClick={() => setAddTarget(row.submitter)}
                              title="클릭하여 소속 등록"
                            >
                              ⚠️ 미등록
                            </button>
                          ) : (
                            emp?.branch ?? ''
                          )}
                        </td>
                        <td className={`${s.td} ${s.tdNoWrap}`}>{row.usageDate}</td>
                        <td className={s.td}>
                          {row.cardCompany} {cardLast4(row.cardNumber)}
                        </td>
                        <td className={s.td}>{row.cardNickname}</td>
                        <td className={s.td}>{row.approvalNumber}</td>
                        <td className={`${s.td} ${s.tdRight}`}>{fmt(row.amount)}</td>
                        <td className={s.td}>{row.submitter}</td>
                        <td className={s.td}>{row.accountSubject}</td>
                        <td className={`${s.td} ${s.tdRight}`}>{fmt(row.approvedAmount)}</td>
                        <td className={`${s.td} ${s.tdRight}`}>{fmt(row.rejectedAmount)}</td>
                        <td className={`${s.td} ${s.tdMemo}`} title={row.memo}>{row.memo}</td>
                        <td className={`${s.td} ${s.tdCenter}`}>
                          <select
                            className={`${s.ndSelect} ${row.effectiveNonDeductible ? s.nonDeductible : s.deductible}`}
                            value={row.effectiveNonDeductible ? '불공제' : '공제'}
                            onChange={(e) =>
                              handleNonDeductibleChange(row.id, e.target.value === '불공제')
                            }
                          >
                            <option value="공제">공제</option>
                            <option value="불공제">불공제</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 토스트 ── */}
      {closeToast && <div className={s.toast}>{closeToast}</div>}

      {/* ── 미인식 제출자 모달 ── */}
      {addTarget && (
        <AddSubmitterModal
          submitterName={addTarget}
          onClose={() => setAddTarget(null)}
          onSave={handleAddSubmitter}
        />
      )}
    </div>
  );
}
