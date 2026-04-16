import { useState } from 'react';
import type { CardBranch } from './types';
import s from './CardBranch.module.css';

const STORAGE_KEY = 'gowith_card_branches';

function load(): CardBranch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: CardBranch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** localStorage의 모든 월별 데이터에서 카드별칭 목록을 추출 */
function collectCardNicknames(): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('gowith_data_')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '[]');
      for (const row of data.rows ?? []) {
        if (row.cardNickname) seen.add(row.cardNickname as string);
      }
    } catch {
      // skip
    }
  }
  return [...seen].sort();
}

interface ModalProps {
  onClose: () => void;
  onSave: (item: Omit<CardBranch, 'id'>) => void;
  initial?: CardBranch;
}

function CardBranchModal({ onClose, onSave, initial }: ModalProps) {
  const [cardNickname, setCardNickname] = useState(initial?.cardNickname ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [branch, setBranch] = useState(initial?.branch ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!cardNickname.trim()) errs.cardNickname = '카드별칭을 입력해주세요.';
    if (!code.trim()) errs.code = '지점코드를 입력해주세요.';
    if (!branch.trim()) errs.branch = '지점명을 입력해주세요.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave({ cardNickname: cardNickname.trim(), code: code.trim().toUpperCase(), branch: branch.trim() });
  };

  return (
    <div className={s.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h3 className={s.modalTitle}>{initial ? '카드 지점 수정' : '카드 지점 추가'}</h3>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={s.modalForm}>
          <div className={s.field}>
            <label className={s.label}>카드별칭</label>
            <input
              className={`${s.input} ${errors.cardNickname ? s.inputError : ''}`}
              value={cardNickname}
              onChange={(e) => { setCardNickname(e.target.value); setErrors((p) => ({ ...p, cardNickname: '' })); }}
              placeholder="예: ADMIN2 체크카드, 역삼 법인카드"
              autoFocus
            />
            {errors.cardNickname && <p className={s.fieldError}>{errors.cardNickname}</p>}
          </div>
          <div className={s.field}>
            <label className={s.label}>지점코드</label>
            <input
              className={`${s.input} ${errors.code ? s.inputError : ''}`}
              value={code}
              onChange={(e) => { setCode(e.target.value); setErrors((p) => ({ ...p, code: '' })); }}
              placeholder="예: A001, C005"
            />
            {errors.code && <p className={s.fieldError}>{errors.code}</p>}
          </div>
          <div className={s.field}>
            <label className={s.label}>지점명</label>
            <input
              className={`${s.input} ${errors.branch ? s.inputError : ''}`}
              value={branch}
              onChange={(e) => { setBranch(e.target.value); setErrors((p) => ({ ...p, branch: '' })); }}
              placeholder="예: 역삼ARC, 재무실"
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

export default function CardBranchPage() {
  const [items, setItems] = useState<CardBranch[]>(load);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CardBranch | null>(null);
  const [snapshotMsg, setSnapshotMsg] = useState('');

  const filtered = items.filter(
    (it) =>
      it.cardNickname.includes(search) ||
      it.code.toLowerCase().includes(search.toLowerCase()) ||
      it.branch.includes(search),
  );

  const handleAdd = (data: Omit<CardBranch, 'id'>) => {
    const updated = [
      ...items,
      { ...data, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` },
    ];
    setItems(updated);
    save(updated);
    setShowModal(false);
  };

  const handleEdit = (data: Omit<CardBranch, 'id'>) => {
    if (!editTarget) return;
    const updated = items.map((it) =>
      it.id === editTarget.id ? { ...it, ...data } : it,
    );
    setItems(updated);
    save(updated);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((it) => it.id !== id);
    setItems(updated);
    save(updated);
  };

  /** 업로드된 월별 데이터에서 카드별칭 스냅샷 가져오기 */
  const handleSnapshot = () => {
    const nicknames = collectCardNicknames();
    if (nicknames.length === 0) {
      setSnapshotMsg('업로드된 월별 데이터가 없습니다.');
      setTimeout(() => setSnapshotMsg(''), 3000);
      return;
    }
    const existing = new Set(items.map((it) => it.cardNickname));
    const newOnes = nicknames.filter((n) => !existing.has(n));
    if (newOnes.length === 0) {
      setSnapshotMsg('모든 카드별칭이 이미 등록되어 있습니다.');
      setTimeout(() => setSnapshotMsg(''), 3000);
      return;
    }
    const newItems: CardBranch[] = newOnes.map((nickname) => ({
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cardNickname: nickname,
      code: '',
      branch: '',
    }));
    const updated = [...items, ...newItems];
    setItems(updated);
    save(updated);
    setSnapshotMsg(`${newItems.length}개 카드별칭을 가져왔습니다. 지점코드와 지점명을 입력해주세요.`);
    setTimeout(() => setSnapshotMsg(''), 4000);
  };

  return (
    <div className={s.wrap}>
      <div className={s.sectionHeader}>
        <div>
          <h2 className={s.sectionTitle}>카드 지점 구분</h2>
          <p className={s.sectionDesc}>
            카드별칭별 지점코드(프로젝트코드) 매핑 테이블입니다.
            월별 내역 확인 시 카드별칭 → 지점 분류에 1순위로 사용됩니다.
          </p>
        </div>
        <div className={s.headerBtns}>
          <button className={s.snapshotBtn} onClick={handleSnapshot}>
            스냅샷 가져오기
          </button>
          <button className={s.addBtn} onClick={() => setShowModal(true)}>
            + 항목 추가
          </button>
        </div>
      </div>

      {snapshotMsg && <div className={s.snapshotNotice}>{snapshotMsg}</div>}

      {/* 검색 */}
      <div className={s.searchWrap}>
        <svg className={s.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className={s.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="카드별칭, 지점코드, 지점명으로 검색"
        />
        {search && (
          <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* 테이블 */}
      <div className={s.tableWrap}>
        <div className={s.tableHeader}>
          <span>카드별칭</span>
          <span>지점코드</span>
          <span>지점명</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <div className={s.empty}>
            {search
              ? `"${search}"에 해당하는 항목이 없습니다.`
              : items.length === 0
              ? '"스냅샷 가져오기"로 현재 업로드된 카드별칭을 불러오거나 직접 추가하세요.'
              : '검색 결과가 없습니다.'}
          </div>
        ) : (
          filtered.map((it) => (
            <div key={it.id} className={s.tableRow}>
              <span className={s.nickname}>{it.cardNickname}</span>
              <span className={it.code ? s.codeBadge : s.emptyBadge}>
                {it.code || '미입력'}
              </span>
              <span className={it.branch ? s.branchText : s.emptyText}>
                {it.branch || '미입력'}
              </span>
              <div className={s.rowActions}>
                <button
                  className={s.editBtn}
                  onClick={() => setEditTarget(it)}
                  aria-label="수정"
                >
                  ✏️
                </button>
                <button
                  className={s.deleteBtn}
                  onClick={() => handleDelete(it.id)}
                  aria-label="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className={s.countText}>
        총 {items.length}개 · 검색 결과 {filtered.length}개
        {items.some((it) => !it.code || !it.branch) && (
          <span className={s.warnText}> · 미입력 항목 있음</span>
        )}
      </p>

      {showModal && (
        <CardBranchModal onClose={() => setShowModal(false)} onSave={handleAdd} />
      )}
      {editTarget && (
        <CardBranchModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
    </div>
  );
}
