import { useState } from 'react';
import type { CardBranch } from './types';
import s from './CardBranch.module.css';

const STORAGE_KEY = 'gowith_card_branches';

// ── 프로젝트 ref 기반 초기 데이터 (고위드_1월_일반.xlsx 카드별칭 기준) ──
const INITIAL: CardBranch[] = [
  { id: 'init_01',  cardNickname: 'ADMIN2',           cardInfo: '롯데카드 3410', code: 'C005', branch: '재무실' },
  { id: 'init_02',  cardNickname: 'ADMIN_reg',         cardInfo: '롯데카드 4160', code: 'C005', branch: '재무실' },
  { id: 'init_03',  cardNickname: 'BG FM',             cardInfo: '롯데카드 3711', code: 'C021', branch: 'FM팀' },
  { id: 'init_04',  cardNickname: 'BG SV',             cardInfo: '롯데카드 3155', code: '',      branch: '' },
  { id: 'init_05',  cardNickname: 'BG영업기획실',      cardInfo: '롯데카드 1771', code: 'C002', branch: '영업기획실' },
  { id: 'init_06',  cardNickname: 'CEO 기명',          cardInfo: '롯데카드 3999', code: 'C006', branch: 'CEO Staff' },
  { id: 'init_07',  cardNickname: 'CFO',               cardInfo: '롯데카드 0506', code: 'C005', branch: '재무실' },
  { id: 'init_08',  cardNickname: 'COO 기명',          cardInfo: '롯데카드 8050', code: 'C006', branch: 'CEO Staff' },
  { id: 'init_09',  cardNickname: 'Cardio Biz',        cardInfo: '롯데카드 5611', code: 'C029', branch: '운영지원팀' },
  { id: 'init_10',  cardNickname: 'DX_tool',           cardInfo: '롯데카드 0666', code: 'C028', branch: 'DX기획팀' },
  { id: 'init_11',  cardNickname: 'DX개발',            cardInfo: '롯데카드 0801', code: 'C028', branch: 'DX기획팀' },
  { id: 'init_12',  cardNickname: 'GFC 광고, 소모',    cardInfo: '롯데카드 7322', code: 'A013', branch: 'GFC' },
  { id: 'init_13',  cardNickname: 'GFC 복후',          cardInfo: '롯데카드 8924', code: 'A013', branch: 'GFC' },
  { id: 'init_14',  cardNickname: 'NBO',               cardInfo: '롯데카드 2933', code: 'C010', branch: 'NBO팀' },
  { id: 'init_15',  cardNickname: 'Product본부',       cardInfo: '롯데카드 0787', code: 'C012', branch: '프로덕트본부 (플랫폼본부)' },
  { id: 'init_16',  cardNickname: 'TB교육',            cardInfo: '롯데카드 2096', code: 'C003', branch: 'TB운영실' },
  { id: 'init_17',  cardNickname: 'TB슈퍼바이징',      cardInfo: '롯데카드 1253', code: 'C003', branch: 'TB운영실' },
  { id: 'init_18',  cardNickname: '가산 광고, 소모',   cardInfo: '롯데카드 8426', code: 'A007', branch: '가산' },
  { id: 'init_19',  cardNickname: '가산 복리후생',     cardInfo: '롯데카드 5628', code: 'A007', branch: '가산' },
  { id: 'init_20',  cardNickname: '가산TB',            cardInfo: '롯데카드 4832', code: 'A007', branch: '가산' },
  { id: 'init_21',  cardNickname: '강변 광고, 소모',   cardInfo: '롯데카드 8845', code: 'A006', branch: '강변' },
  { id: 'init_22',  cardNickname: '강변 복리후생',     cardInfo: '롯데카드 4102', code: 'A006', branch: '강변' },
  { id: 'init_23',  cardNickname: '강변TB',            cardInfo: '롯데카드 1952', code: 'A006', branch: '강변' },
  { id: 'init_24',  cardNickname: '공간개발',          cardInfo: '롯데카드 1359', code: 'C011', branch: '공간개발팀' },
  { id: 'init_25',  cardNickname: '광고비',            cardInfo: '롯데카드 1221', code: 'C014', branch: '마케팅실' },
  { id: 'init_26',  cardNickname: '광화문 광고, 소모', cardInfo: '롯데카드 8317', code: 'A009', branch: '광화문' },
  { id: 'init_27',  cardNickname: '광화문 복리후생',   cardInfo: '롯데카드 9862', code: 'A009', branch: '광화문' },
  { id: 'init_28',  cardNickname: '광화문TB',          cardInfo: '롯데카드 8411', code: 'A009', branch: '광화문' },
  { id: 'init_29',  cardNickname: '논현 광고, 소모',   cardInfo: '롯데카드 9817', code: 'A004', branch: '논현' },
  { id: 'init_30',  cardNickname: '논현 복리후생',     cardInfo: '롯데카드 5816', code: 'A004', branch: '논현' },
  { id: 'init_31',  cardNickname: '논현TB',            cardInfo: '롯데카드 4812', code: 'A004', branch: '논현' },
  { id: 'init_32',  cardNickname: '도곡 광고, 소모',   cardInfo: '롯데카드 8750', code: 'A002', branch: '도곡' },
  { id: 'init_33',  cardNickname: '도곡 복리후생',     cardInfo: '롯데카드 8209', code: 'A002', branch: '도곡' },
  { id: 'init_34',  cardNickname: '도곡TB',            cardInfo: '롯데카드 4557', code: 'A002', branch: '도곡' },
  { id: 'init_35',  cardNickname: '마곡 TB',           cardInfo: '롯데카드 4757', code: 'A011', branch: '마곡' },
  { id: 'init_36',  cardNickname: '마곡 광고소모',     cardInfo: '롯데카드 8418', code: 'A011', branch: '마곡' },
  { id: 'init_37',  cardNickname: '마곡 복후',         cardInfo: '롯데카드 6010', code: 'A011', branch: '마곡' },
  { id: 'init_38',  cardNickname: '마케팅실',          cardInfo: '롯데카드 1616', code: 'C014', branch: '마케팅실' },
  { id: 'init_39',  cardNickname: '마포 광고, 소모',   cardInfo: '롯데카드 1467', code: 'A017', branch: '마포' },
  { id: 'init_40',  cardNickname: '박한희',            cardInfo: '롯데카드 5090', code: 'C007', branch: '커뮤니케이션팀' },
  { id: 'init_41',  cardNickname: '브컴',              cardInfo: '롯데카드 6846', code: 'C015', branch: '브랜드마케팅팀' },
  { id: 'init_42',  cardNickname: '사업운영본부',      cardInfo: '롯데카드 1687', code: 'C017', branch: '사업운영본부' },
  { id: 'init_43',  cardNickname: '삼성 광고, 소모',   cardInfo: '롯데카드 8754', code: 'A008', branch: '삼성' },
  { id: 'init_44',  cardNickname: '삼성 복리후생',     cardInfo: '롯데카드 7898', code: 'A008', branch: '삼성' },
  { id: 'init_45',  cardNickname: '삼성TB',            cardInfo: '롯데카드 4499', code: 'A008', branch: '삼성' },
  { id: 'init_46',  cardNickname: '상도 광고, 소모',   cardInfo: '롯데카드 9170', code: 'A014', branch: '상도' },
  { id: 'init_47',  cardNickname: '상도 복리후생',     cardInfo: '롯데카드 6884', code: 'A014', branch: '상도' },
  { id: 'init_48',  cardNickname: '신도림 광고소모re', cardInfo: '롯데카드 7387', code: 'A003', branch: '신도림' },
  { id: 'init_49',  cardNickname: '신도림 복리후생re', cardInfo: '롯데카드 7006', code: 'A003', branch: '신도림' },
  { id: 'init_50',  cardNickname: '신도림TB',          cardInfo: '롯데카드 4500', code: 'A003', branch: '신도림' },
  { id: 'init_51',  cardNickname: '야근식대',          cardInfo: '롯데카드 0640', code: 'Z001', branch: '지점_전사귀속' },
  { id: 'init_52',  cardNickname: '역삼 광고, 소모',   cardInfo: '롯데카드 9666', code: 'A001', branch: '역삼ARC' },
  { id: 'init_53',  cardNickname: '역삼 복리후생',     cardInfo: '롯데카드 6816', code: 'A001', branch: '역삼ARC' },
  { id: 'init_54',  cardNickname: '역삼TB',            cardInfo: '롯데카드 2359', code: 'A001', branch: '역삼ARC' },
  { id: 'init_55',  cardNickname: '오피스 자산구매',   cardInfo: '롯데카드 0057', code: 'C001', branch: '오피스' },
  { id: 'init_56',  cardNickname: '운영지원',          cardInfo: '롯데카드 3741', code: 'C029', branch: '운영지원팀' },
  { id: 'init_57',  cardNickname: '전사 tool',         cardInfo: '롯데카드 0451', code: 'Z001', branch: '지점_전사귀속' },
  { id: 'init_58',  cardNickname: '지점개발팀',        cardInfo: '롯데카드 1528', code: 'C009', branch: '지점개발팀' },
  { id: 'init_59',  cardNickname: '판교 광고, 소모',   cardInfo: '롯데카드 9856', code: 'A005', branch: '판교' },
  { id: 'init_60',  cardNickname: '판교 복리후생',     cardInfo: '롯데카드 6497', code: 'A005', branch: '판교' },
  { id: 'init_61',  cardNickname: '판교TB_re',         cardInfo: '롯데카드 1240', code: 'A005', branch: '판교' },
  { id: 'init_62',  cardNickname: '판교벤처 광고소모', cardInfo: '롯데카드 8316', code: 'A012', branch: '판교벤처' },
  { id: 'init_63',  cardNickname: '판교벤처 복후',     cardInfo: '롯데카드 5880', code: 'A012', branch: '판교벤처' },
  { id: 'init_64',  cardNickname: '피플',              cardInfo: '롯데카드 1206', code: 'C004', branch: '피플팀' },
  { id: 'init_65',  cardNickname: '피플_re',           cardInfo: '롯데카드 2788', code: 'C004', branch: '피플팀' },
  { id: 'init_66',  cardNickname: '피플팀',            cardInfo: '롯데카드 1757', code: 'C004', branch: '피플팀' },
  { id: 'init_67',  cardNickname: '한티 광고, 소모',   cardInfo: '롯데카드 7827', code: 'A010', branch: '한티역' },
  { id: 'init_68',  cardNickname: '한티 복리후생',     cardInfo: '롯데카드 8751', code: 'A010', branch: '한티역' },
  { id: 'init_69',  cardNickname: '합정 광고, 소모',   cardInfo: '롯데카드 7119', code: 'A015', branch: '합정' },
  { id: 'init_70',  cardNickname: '합정 복리후생',     cardInfo: '롯데카드 8972', code: 'A015', branch: '합정' },
  { id: 'init_71',  cardNickname: '합정TB',            cardInfo: '롯데카드 4259', code: 'A015', branch: '합정' },
  { id: 'init_72',  cardNickname: '항공권 카드',       cardInfo: '롯데카드 8410', code: 'Z001', branch: '지점_전사귀속' },
];

function load(): CardBranch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL;
  } catch {
    return INITIAL;
  }
}

function save(items: CardBranch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

interface ModalProps {
  onClose: () => void;
  onSave: (item: Omit<CardBranch, 'id'>) => void;
  initial?: CardBranch;
}

function CardBranchModal({ onClose, onSave, initial }: ModalProps) {
  const [cardNickname, setCardNickname] = useState(initial?.cardNickname ?? '');
  const [cardInfo, setCardInfo] = useState(initial?.cardInfo ?? '');
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
    onSave({
      cardNickname: cardNickname.trim(),
      cardInfo: cardInfo.trim() || undefined,
      code: code.trim().toUpperCase(),
      branch: branch.trim(),
    });
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
              placeholder="예: 역삼 광고, 소모"
              autoFocus
            />
            {errors.cardNickname && <p className={s.fieldError}>{errors.cardNickname}</p>}
          </div>
          <div className={s.field}>
            <label className={s.label}>카드정보 (선택)</label>
            <input
              className={s.input}
              value={cardInfo}
              onChange={(e) => setCardInfo(e.target.value)}
              placeholder="예: 롯데카드 9666"
            />
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

  const filtered = items.filter(
    (it) =>
      it.cardNickname.includes(search) ||
      (it.cardInfo ?? '').includes(search) ||
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
        <button className={s.addBtn} onClick={() => setShowModal(true)}>
          + 항목 추가
        </button>
      </div>

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
          placeholder="카드별칭, 카드정보, 지점코드, 지점명으로 검색"
        />
        {search && (
          <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* 테이블 */}
      <div className={s.tableWrap}>
        <div className={s.tableHeader}>
          <span>카드별칭</span>
          <span>카드정보</span>
          <span>지점코드</span>
          <span>지점명</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <div className={s.empty}>
            {search ? `"${search}"에 해당하는 항목이 없습니다.` : '등록된 항목이 없습니다.'}
          </div>
        ) : (
          filtered.map((it) => (
            <div key={it.id} className={s.tableRow}>
              <span className={s.nickname}>{it.cardNickname}</span>
              <span className={it.cardInfo ? s.cardInfoText : s.emptyText}>
                {it.cardInfo || '-'}
              </span>
              <span className={it.code ? s.codeBadge : s.emptyBadge}>
                {it.code || '미입력'}
              </span>
              <span className={it.branch ? s.branchText : s.emptyText}>
                {it.branch || '미입력'}
              </span>
              <div className={s.rowActions}>
                <button className={s.editBtn} onClick={() => setEditTarget(it)} aria-label="수정">✏️</button>
                <button className={s.deleteBtn} onClick={() => handleDelete(it.id)} aria-label="삭제">✕</button>
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
