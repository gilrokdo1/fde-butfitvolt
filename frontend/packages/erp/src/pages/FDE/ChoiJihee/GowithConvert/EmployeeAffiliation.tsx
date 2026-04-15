import { useState } from 'react';
import s from './EmployeeAffiliation.module.css';

interface Employee {
  id: string;
  name: string;
  code: string;
  branch: string;
}

const STORAGE_KEY = 'gowith_employees';

const INITIAL_EMPLOYEES: Employee[] = [
  // BG 지점 (A코드)
  { id: 'init_01', name: '허어진', code: 'A001', branch: '역삼ARC' },
  { id: 'init_02', name: '정석환', code: 'A003', branch: '신도림' },
  { id: 'init_03', name: '최지훈', code: 'A003', branch: '신도림' },
  { id: 'init_04', name: '양동원', code: 'A004', branch: '논현' },
  { id: 'init_05', name: '정한정', code: 'A005', branch: '판교' },
  { id: 'init_06', name: '임동환', code: 'A006', branch: '강변' },
  { id: 'init_07', name: '이현석', code: 'A007', branch: '가산' },
  { id: 'init_08', name: '이민석', code: 'A008', branch: '삼성' },
  { id: 'init_09', name: '김희수', code: 'A008', branch: '삼성' },
  { id: 'init_10', name: '김준웅', code: 'A009', branch: '광화문' },
  { id: 'init_11', name: '양진모', code: 'A010', branch: '한티역' },
  { id: 'init_12', name: '백민주', code: 'A011', branch: '마곡' },
  { id: 'init_13', name: '홍성현', code: 'A011', branch: '마곡' },
  { id: 'init_14', name: '진다현', code: 'A012', branch: '판교벤처' },
  { id: 'init_15', name: '김용철', code: 'A013', branch: 'GFC' },
  { id: 'init_16', name: '오혜인', code: 'A013', branch: 'GFC' },
  { id: 'init_17', name: '이미영', code: 'A015', branch: '합정' },
  // 오피스/팀 (C코드)
  { id: 'init_18', name: '김지은', code: 'C004', branch: '피플팀' },
  { id: 'init_19', name: '신명진', code: 'C004', branch: '피플팀' },
  { id: 'init_20', name: '김형기', code: 'C005', branch: '재무실' },
  { id: 'init_21', name: '박한희', code: 'C007', branch: '커뮤니케이션팀' },
  { id: 'init_22', name: '이거연', code: 'C007', branch: '커뮤니케이션팀' },
  { id: 'init_23', name: '김진명', code: 'C011', branch: '공간개발팀' },
  { id: 'init_24', name: '김현준', code: 'C011', branch: '공간개발팀' },
  { id: 'init_25', name: '박경식', code: 'C014', branch: '마케팅실' },
  { id: 'init_26', name: '주수정', code: 'C014', branch: '마케팅실' },
  { id: 'init_27', name: '최재은', code: 'C028', branch: 'DX기획팀' },
];

function loadEmployees(): Employee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_EMPLOYEES;
  } catch {
    return INITIAL_EMPLOYEES;
  }
}

function saveEmployees(employees: Employee[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
}

interface ModalProps {
  onClose: () => void;
  onSave: (emp: Omit<Employee, 'id'>) => void;
  initial?: Employee;
}

function EmployeeModal({ onClose, onSave, initial }: ModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [branch, setBranch] = useState(initial?.branch ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = '이름을 입력해주세요.';
    if (!code.trim()) e.code = '소속코드를 입력해주세요.';
    if (!branch.trim()) e.branch = '팀/지점명을 입력해주세요.';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave({ name: name.trim(), code: code.trim().toUpperCase(), branch: branch.trim() });
  };

  return (
    <div className={s.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h3 className={s.modalTitle}>{initial ? '직원 수정' : '직원 추가'}</h3>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={s.modalForm}>
          <div className={s.field}>
            <label className={s.label}>이름</label>
            <input
              className={`${s.input} ${errors.name ? s.inputError : ''}`}
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: '' })); }}
              placeholder="예: 홍길동"
              autoFocus
            />
            {errors.name && <p className={s.fieldError}>{errors.name}</p>}
          </div>
          <div className={s.field}>
            <label className={s.label}>소속코드</label>
            <input
              className={`${s.input} ${errors.code ? s.inputError : ''}`}
              value={code}
              onChange={(e) => { setCode(e.target.value); setErrors((prev) => ({ ...prev, code: '' })); }}
              placeholder="예: A001, C007"
            />
            {errors.code && <p className={s.fieldError}>{errors.code}</p>}
          </div>
          <div className={s.field}>
            <label className={s.label}>팀/지점</label>
            <input
              className={`${s.input} ${errors.branch ? s.inputError : ''}`}
              value={branch}
              onChange={(e) => { setBranch(e.target.value); setErrors((prev) => ({ ...prev, branch: '' })); }}
              placeholder="예: 역삼ARC, 마케팅실"
            />
            {errors.branch && <p className={s.fieldError}>{errors.branch}</p>}
          </div>
          <div className={s.modalActions}>
            <button type="button" className={s.cancelBtn} onClick={onClose}>취소</button>
            <button type="submit" className={s.saveBtn}>저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeAffiliation() {
  const [employees, setEmployees] = useState<Employee[]>(loadEmployees);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);

  const filtered = employees.filter(
    (e) =>
      e.name.includes(search) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.branch.includes(search),
  );

  const handleAdd = (data: Omit<Employee, 'id'>) => {
    const updated = [
      ...employees,
      { ...data, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` },
    ];
    setEmployees(updated);
    saveEmployees(updated);
    setShowModal(false);
  };

  const handleEdit = (data: Omit<Employee, 'id'>) => {
    if (!editTarget) return;
    const updated = employees.map((e) =>
      e.id === editTarget.id ? { ...e, ...data } : e,
    );
    setEmployees(updated);
    saveEmployees(updated);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    const updated = employees.filter((e) => e.id !== id);
    setEmployees(updated);
    saveEmployees(updated);
  };

  return (
    <div className={s.wrap}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>임직원 소속</h2>
          <p className={s.sectionDesc}>
            직원별 소속코드(프로젝트코드) 매핑 테이블입니다.
            고위드 내역 변환 시 이름 → 코드 조회에 사용됩니다.
          </p>
        </div>
        <button className={s.addBtn} onClick={() => setShowModal(true)}>
          + 직원 추가
        </button>
      </div>

      {/* 검색 */}
      <div className={s.searchWrap}>
        <svg className={s.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className={s.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 코드, 팀/지점으로 검색"
        />
        {search && (
          <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* 테이블 */}
      <div className={s.tableWrap}>
        <div className={s.tableHeader}>
          <span>이름</span>
          <span>소속코드</span>
          <span>팀 / 지점</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <div className={s.empty}>
            {search ? `"${search}"에 해당하는 직원이 없습니다.` : '등록된 직원이 없습니다.'}
          </div>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id} className={s.tableRow}>
              <span className={s.empName}>{emp.name}</span>
              <span className={s.codeBadge}>{emp.code}</span>
              <span className={s.empBranch}>{emp.branch}</span>
              <div className={s.rowActions}>
                <button
                  className={s.editBtn}
                  onClick={() => setEditTarget(emp)}
                  aria-label="수정"
                >
                  ✏️
                </button>
                <button
                  className={s.deleteBtn}
                  onClick={() => handleDelete(emp.id)}
                  aria-label="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className={s.countText}>총 {employees.length}명 · 검색 결과 {filtered.length}명</p>

      {/* 추가 모달 */}
      {showModal && (
        <EmployeeModal
          onClose={() => setShowModal(false)}
          onSave={handleAdd}
        />
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <EmployeeModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
    </div>
  );
}
