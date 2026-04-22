import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMemberPurchases,
  getTrainerActiveMembers,
  getTrainerReregMembers,
  getTrainerSessions,
  getTrainerTrialMembers,
  type ActiveMemberRow,
  type MemberPurchaseRow,
  type ReregMemberRow,
  type TrainerSessionRow,
  type TrialMemberRow,
} from '../../../api/fde';
import s from './Trainers.module.css';

export type DetailKind = 'sessions' | 'trial' | 'rereg' | 'active';

interface Props {
  kind: DetailKind;
  trainerName: string;
  trainerUserIds: number[];
  branch: string;
  start: string;
  end: string;
  onClose: () => void;
}

const KIND_TITLE: Record<DetailKind, string> = {
  sessions: '월 세션 상세',
  trial: '체험전환 대상 회원',
  rereg: '재등록 대상 회원',
  active: '유효회원 목록',
};

type Row =
  | ({ _kind: 'sessions' } & TrainerSessionRow)
  | ({ _kind: 'trial' } & TrialMemberRow)
  | ({ _kind: 'rereg' } & ReregMemberRow)
  | ({ _kind: 'active' } & ActiveMemberRow);

function fmtCount(total: number | null, used: number | null, remain?: number | null): string {
  const t = total ?? 0;
  const u = used ?? 0;
  const r = remain ?? Math.max(t - u, 0);
  return `${u}/${t} (잔 ${r})`;
}

export default function MemberDetailModal({ kind, trainerName, trainerUserIds, branch, start, end, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  // 아코디언: contact로 확장 상태 관리
  const [expanded, setExpanded] = useState<Record<string, MemberPurchaseRow[] | 'loading' | undefined>>({});

  const idsKey = trainerUserIds.join(',');
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setExpanded({});
    try {
      if (kind === 'sessions') {
        const res = await getTrainerSessions(trainerName, branch, start, end);
        setRows(res.data.data.map((r) => ({ _kind: 'sessions' as const, ...r })));
      } else if (kind === 'trial') {
        const res = await getTrainerTrialMembers(trainerName, branch, start, end, trainerUserIds);
        setRows(res.data.data.map((r) => ({ _kind: 'trial' as const, ...r })));
      } else if (kind === 'rereg') {
        const res = await getTrainerReregMembers(trainerName, branch, start, end, trainerUserIds);
        setRows(res.data.data.map((r) => ({ _kind: 'rereg' as const, ...r })));
      } else {
        const res = await getTrainerActiveMembers(trainerName, branch, start, end, trainerUserIds);
        setRows(res.data.data.map((r) => ({ _kind: 'active' as const, ...r })));
      }
    } finally {
      setLoading(false);
    }
  // idsKey로 배열 변경을 감지 (참조 동등성 회피)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, trainerName, branch, start, end, idsKey]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const toggleMember = async (contact: string | null) => {
    if (!contact) return;
    if (expanded[contact] && expanded[contact] !== 'loading') {
      // collapse
      setExpanded((p) => ({ ...p, [contact]: undefined }));
      return;
    }
    setExpanded((p) => ({ ...p, [contact]: 'loading' }));
    try {
      const res = await getMemberPurchases(contact, start, end);
      setExpanded((p) => ({ ...p, [contact]: res.data.data }));
    } catch {
      setExpanded((p) => ({ ...p, [contact]: [] }));
    }
  };

  // 요약 숫자
  const summary = useMemo(() => {
    if (kind === 'sessions') {
      const sessRows = rows as Array<{ _kind: 'sessions' } & TrainerSessionRow>;
      const total = sessRows.length;
      const attended = sessRows.filter((r) => r.출석여부 === '출석').length;
      return `총 ${total.toLocaleString('ko-KR')}건 · 출석 ${attended.toLocaleString('ko-KR')}건`;
    }
    if (kind === 'trial') {
      const trialRows = rows as Array<{ _kind: 'trial' } & TrialMemberRow>;
      const conv = trialRows.filter((r) => r.전환재등록 === '체험전환').length;
      return `종료 ${trialRows.length}명 · 전환 ${conv}명 (${trialRows.length ? ((conv / trialRows.length) * 100).toFixed(1) : '0.0'}%)`;
    }
    if (kind === 'rereg') {
      const reregRows = rows as Array<{ _kind: 'rereg' } & ReregMemberRow>;
      const re = reregRows.filter((r) => r.재등록여부).length;
      return `만료 ${reregRows.length}명 · 재등록 ${re}명 (${reregRows.length ? ((re / reregRows.length) * 100).toFixed(1) : '0.0'}%)`;
    }
    const distinct = new Set(rows.map((r) => (r as ActiveMemberRow).회원연락처).filter(Boolean)).size;
    return `멤버십 ${rows.length}건 · 고유 회원 ${distinct}명`;
  }, [rows, kind]);

  const renderHeader = () => {
    if (kind === 'sessions') {
      return (
        <tr>
          <th>수업일시</th>
          <th>회원</th>
          <th>멤버십</th>
          <th>체험/정규</th>
          <th>출석</th>
        </tr>
      );
    }
    if (kind === 'trial') {
      return (
        <tr>
          <th>회원</th>
          <th>멤버십</th>
          <th>체험 시작</th>
          <th>체험 종료</th>
          <th>사용/총</th>
          <th>전환 결과</th>
        </tr>
      );
    }
    if (kind === 'rereg') {
      return (
        <tr>
          <th>회원</th>
          <th>멤버십</th>
          <th>정규 시작</th>
          <th>정규 종료</th>
          <th>사용/총</th>
          <th>재등록</th>
        </tr>
      );
    }
    return (
      <tr>
        <th>회원</th>
        <th>멤버십</th>
        <th>시작</th>
        <th>종료</th>
        <th>사용/총</th>
      </tr>
    );
  };

  const renderRow = (r: Row, idx: number) => {
    const contact = (r as { 회원연락처?: string | null }).회원연락처 ?? null;
    const name = (r as { 회원이름?: string | null }).회원이름 ?? '(이름없음)';
    const isExpandable = Boolean(contact);
    const state = contact ? expanded[contact] : undefined;
    const isOpen = Array.isArray(state);
    const isLoading = state === 'loading';

    const memberCell = (
      <td
        className={isExpandable ? s.memberCell : ''}
        onClick={() => isExpandable && toggleMember(contact)}
        title={isExpandable ? '구매 내역 보기' : undefined}
      >
        <span className={s.memberName}>{name}</span>
        {contact && <span className={s.memberContact}>{contact}</span>}
        {isExpandable && (
          <span className={s.accordionArrow}>{isOpen ? '▾' : '▸'}</span>
        )}
      </td>
    );

    const mainRow: React.ReactNode = (() => {
      if (r._kind === 'sessions') {
        return (
          <tr key={`r-${idx}`} className={s.detailRow}>
            <td>{r.수업날짜} {r.시작시간?.slice(0, 5)}</td>
            {memberCell}
            <td className={s.cellWrap}>{r.멤버십명 ?? '-'}</td>
            <td>{r.체험정규 ?? '-'}</td>
            <td>
              <span className={`${s.miniBadge} ${r.출석여부 === '출석' ? s.miniOk : r.출석여부 === '결석' ? s.miniErr : s.miniMuted}`}>
                {r.출석여부 ?? '-'}
              </span>
            </td>
          </tr>
        );
      }
      if (r._kind === 'trial') {
        return (
          <tr key={`r-${idx}`} className={s.detailRow}>
            {memberCell}
            <td className={s.cellWrap}>{r.멤버십명 ?? '-'}</td>
            <td>{r.멤버십시작일}</td>
            <td>{r.멤버십종료일}</td>
            <td>{fmtCount(r.총횟수, r.사용횟수)}</td>
            <td>
              <span className={`${s.miniBadge} ${r.전환재등록 === '체험전환' ? s.miniOk : s.miniErr}`}>
                {r.전환재등록 ?? '-'}
              </span>
            </td>
          </tr>
        );
      }
      if (r._kind === 'rereg') {
        return (
          <tr key={`r-${idx}`} className={s.detailRow}>
            {memberCell}
            <td className={s.cellWrap}>{r.멤버십명 ?? '-'}</td>
            <td>{r.멤버십시작일}</td>
            <td>{r.멤버십종료일}</td>
            <td>{fmtCount(r.총횟수, r.사용횟수)}</td>
            <td>
              <span className={`${s.miniBadge} ${r.재등록여부 ? s.miniOk : s.miniErr}`}>
                {r.재등록여부 ? '재등록' : '미재등록'}
              </span>
            </td>
          </tr>
        );
      }
      // active
      return (
        <tr key={`r-${idx}`} className={s.detailRow}>
          {memberCell}
          <td className={s.cellWrap}>{r.멤버십명 ?? '-'}</td>
          <td>{r.멤버십시작일}</td>
          <td>{r.멤버십종료일}</td>
          <td>{fmtCount(r.총횟수, r.사용횟수, r.잔여횟수)}</td>
        </tr>
      );
    })();

    const colspan =
      r._kind === 'sessions' ? 5 :
      r._kind === 'active' ? 5 : 6;

    return (
      <Fragment key={`group-${idx}`}>
        {mainRow}
        {isOpen && contact && (
          <tr className={s.purchaseRow}>
            <td colSpan={colspan}>
              <PurchaseAccordion
                rows={state as MemberPurchaseRow[]}
                currentTrainer={trainerName}
              />
            </td>
          </tr>
        )}
        {isLoading && contact && (
          <tr className={s.purchaseRow}>
            <td colSpan={colspan} style={{ color: 'var(--text-tertiary)' }}>
              불러오는 중…
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.drawerHeader}>
          <div>
            <div className={s.drawerTitle}>{KIND_TITLE[kind]}</div>
            <div className={s.meta}>
              <span>{trainerName} · {branch}</span>
              <span>{start} ~ {end}</span>
              <span>{summary}</span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">×</button>
        </div>
        {loading ? (
          <div className={s.loading}>불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className={s.empty}>해당 기간에 데이터가 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>{renderHeader()}</thead>
              <tbody>
                {rows.map((r, i) => renderRow(r, i))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PurchaseAccordion({
  rows,
  currentTrainer,
}: {
  rows: MemberPurchaseRow[];
  currentTrainer: string;
}) {
  if (!rows || rows.length === 0) {
    return <div className={s.purchaseEmpty}>기간 내 PT 구매 내역이 없습니다.</div>;
  }
  return (
    <div className={s.purchaseWrap}>
      <div className={s.purchaseTitle}>구매 내역 ({rows.length}건)</div>
      <table className={s.purchaseTable}>
        <thead>
          <tr>
            <th>지점</th>
            <th>멤버십</th>
            <th>체험/정규</th>
            <th>시작</th>
            <th>종료</th>
            <th>사용/총</th>
            <th>담당 트레이너</th>
            <th>전환/재등록</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isOther = r.담당트레이너 && r.담당트레이너 !== currentTrainer;
            return (
              <tr key={i}>
                <td>{r.지점명 ?? '-'}</td>
                <td className={s.cellWrap}>{r.멤버십명 ?? '-'}</td>
                <td>{r.체험정규 ?? '-'}</td>
                <td>{r.멤버십시작일}</td>
                <td>{r.멤버십종료일}</td>
                <td>{fmtCount(r.총횟수, r.사용횟수, r.잔여횟수)}</td>
                <td className={isOther ? s.otherTrainer : ''}>
                  {r.담당트레이너 ?? '-'}
                  {isOther && <span className={s.otherTrainerTag}>타 트레이너</span>}
                </td>
                <td>{r.전환재등록 ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
