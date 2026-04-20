import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTeamfitMembers, type TeamfitMember } from '../../../api/fde';
import s from './MemberModal.module.css';

interface Props {
  place: string;
  date: string;
  onClose: () => void;
}

const COLUMNS: { key: keyof TeamfitMember; label: string }[] = [
  { key: '지점',     label: '지점' },
  { key: '이름',     label: '이름' },
  { key: '연락처',   label: '연락처' },
  { key: '멤버십명', label: '멤버십명' },
  { key: '성별',     label: '성별' },
  { key: '나이',     label: '나이' },
  { key: '시작일',   label: '시작일' },
  { key: '종료일',   label: '종료일' },
  { key: '결제금액', label: '결제금액' },
  { key: '결제일',   label: '결제일' },
  { key: '임직원여부', label: '임직원' },
  { key: '마케팅동의', label: '마케팅동의' },
];

function formatCell(key: keyof TeamfitMember, value: TeamfitMember[typeof key]) {
  if (value === null || value === undefined) return '-';
  if (key === '결제금액') return `${Number(value).toLocaleString()}원`;
  if (key === '나이') return `${value}세`;
  if (key === '시작일' || key === '종료일' || key === '결제일') {
    return String(value).slice(0, 10);
  }
  return String(value);
}

export default function MemberModal({ place, date, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['teamfit-members', place, date],
    queryFn: () => getTeamfitMembers(place, date).then((r) => r.data),
  });

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 모달 열릴 때 body 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <h2 className={s.modalTitle}>{place}</h2>
            <p className={s.modalSubtitle}>
              {date} 기준 팀버핏 유효회원
              {data && <> · <strong>{data.count}명</strong></>}
            </p>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className={s.tableWrap}>
          {isLoading && <p className={s.state}>불러오는 중...</p>}
          {isError  && <p className={s.stateError}>데이터를 불러오지 못했습니다.</p>}
          {data && data.members.length === 0 && (
            <p className={s.state}>유효회원이 없습니다.</p>
          )}
          {data && data.members.length > 0 && (
            <table className={s.table}>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.members.map((member, i) => (
                  <tr key={i}>
                    {COLUMNS.map((col) => (
                      <td key={col.key}>{formatCell(col.key, member[col.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
