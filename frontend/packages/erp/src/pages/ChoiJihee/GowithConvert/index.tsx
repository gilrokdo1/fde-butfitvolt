import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ExcelUpload from './ExcelUpload';
import EmployeeAffiliation from './EmployeeAffiliation';
import CardBranchPage from './CardBranch';
import MonthlyHistory from './MonthlyHistory';
import s from './GowithConvert.module.css';

type TabId = 'excel-upload' | 'employee-affiliation' | 'card-branch' | 'monthly-history';

const MENU_GROUPS = [
  {
    id: 'raw-data',
    label: 'Raw Data',
    items: [
      { id: 'excel-upload' as TabId, label: '엑셀 업로드' },
      { id: 'employee-affiliation' as TabId, label: '임직원 소속' },
      { id: 'card-branch' as TabId, label: '카드 지점 구분' },
    ],
  },
  {
    id: 'history',
    label: '내역 확인',
    items: [
      { id: 'monthly-history' as TabId, label: '월별 내역 확인' },
    ],
  },
];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isAuthed, setIsAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.name === '최지희') {
      setIsAuthed(true);
      return;
    }
    if (sessionStorage.getItem('gowith_auth') === 'true') {
      setIsAuthed(true);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() === 'FDE1') {
      sessionStorage.setItem('gowith_auth', 'true');
      setIsAuthed(true);
    } else {
      setError('인증번호가 올바르지 않습니다.');
      setCode('');
    }
  };

  if (!isAuthed) {
    return (
      <div className={s.authWrap}>
        <div className={s.authCard}>
          <span className={s.authIcon} style={{ fontFamily: 'Tossface' }}>🔐</span>
          <h2 className={s.authTitle}>접근 인증</h2>
          <p className={s.authDesc}>
            이 메뉴는 인증이 필요합니다.<br />인증번호를 입력해주세요.
          </p>
          <form onSubmit={handleSubmit} className={s.authForm}>
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="인증번호 입력"
              className={s.authInput}
              autoFocus
            />
            {error && <p className={s.authError}>{error}</p>}
            <button type="submit" className={s.authBtn}>확인</button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function GowithConvert() {
  const [activeTab, setActiveTab] = useState<TabId>('excel-upload');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['raw-data']);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  return (
    <AuthGate>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>고위드 변환</h1>
          <p className={s.subtitle}>고위드 카드 내역을 더존 자동전표 양식으로 변환합니다.</p>
        </div>

        <div className={s.layout}>
          {/* 사이드바 */}
          <aside className={s.sidebar}>
            {MENU_GROUPS.map((group) => (
              <div key={group.id} className={s.sideGroup}>
                <button
                  className={s.sideGroupTitle}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.label}</span>
                  <svg
                    className={`${s.chevron} ${expandedGroups.includes(group.id) ? s.chevronOpen : ''}`}
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                  >
                    <path
                      d="M3 5l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {expandedGroups.includes(group.id) && (
                  <div className={s.sideItems}>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className={`${s.sideItem} ${activeTab === item.id ? s.active : ''}`}
                        onClick={() => setActiveTab(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </aside>

          {/* 콘텐츠 */}
          <div className={s.content}>
            {activeTab === 'excel-upload' && <ExcelUpload />}
            {activeTab === 'employee-affiliation' && <EmployeeAffiliation />}
            {activeTab === 'card-branch' && <CardBranchPage />}
            {activeTab === 'monthly-history' && <MonthlyHistory />}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
