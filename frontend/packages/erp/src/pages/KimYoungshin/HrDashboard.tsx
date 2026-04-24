import s from './KimYoungshin.module.css';

const KPI_CARDS = [
  { label: '전체 임직원', value: '247', unit: '명', change: '+3', changeType: 'up', icon: '👥' },
  { label: '이번 달 입사', value: '8', unit: '명', change: '+2', changeType: 'up', icon: '🆕' },
  { label: '이번 달 퇴사', value: '3', unit: '명', change: '-1', changeType: 'down', icon: '👋' },
  { label: '평균 근속', value: '3.2', unit: '년', change: '+0.1', changeType: 'up', icon: '📅' },
];

const DEPARTMENTS = [
  { name: '개발팀', count: 72, color: '#5B5FC7' },
  { name: '영업팀', count: 48, color: '#6366F1' },
  { name: '마케팅팀', count: 35, color: '#818CF8' },
  { name: '피플팀', count: 22, color: '#A5B4FC' },
  { name: 'BG영업기획팀', count: 31, color: '#C7D2FE' },
  { name: '재무팀', count: 19, color: '#DDD6FE' },
  { name: '기타', count: 20, color: '#EDE9FE' },
];

const MAX_DEPT_COUNT = Math.max(...DEPARTMENTS.map(d => d.count));

const RECENT_HIRES = [
  { name: '이준혁', dept: '개발팀', position: '시니어 개발자', date: '2026-04-10', status: '온보딩 중' },
  { name: '박서연', dept: '마케팅팀', position: '마케팅 매니저', date: '2026-04-08', status: '온보딩 중' },
  { name: '김민준', dept: '피플팀', position: 'HR 전문가', date: '2026-04-05', status: '온보딩 중' },
  { name: '최지영', dept: '영업팀', position: '영업 대표', date: '2026-04-03', status: '완료' },
  { name: '정다은', dept: '재무팀', position: '재무 분석가', date: '2026-04-01', status: '완료' },
];

const SCHEDULES = [
  { date: '04.15', title: '신입사원 온보딩 오리엔테이션', type: 'onboarding', participants: 8 },
  { date: '04.17', title: '2분기 성과 리뷰 킥오프', type: 'review', participants: 24 },
  { date: '04.21', title: '임원 인터뷰 — 개발팀 리드', type: 'interview', participants: 3 },
  { date: '04.24', title: '전사 문화 워크숍', type: 'culture', participants: 60 },
  { date: '04.28', title: '5월 입사자 OJT 준비 미팅', type: 'onboarding', participants: 5 },
];

const SCHEDULE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  onboarding: { label: '온보딩', color: '#5B5FC7' },
  review: { label: '성과 리뷰', color: '#10b981' },
  interview: { label: '인터뷰', color: '#f59e0b' },
  culture: { label: '문화', color: '#ec4899' },
};

const GENDER_RATIO = { male: 58, female: 42 };

const AGE_GROUPS = [
  { label: '20대', percent: 28 },
  { label: '30대', percent: 45 },
  { label: '40대', percent: 20 },
  { label: '50대+', percent: 7 },
];

export default function HrDashboard() {
  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>HR 대시보드</h1>
          <p className={s.subtitle}>김영신 · 피플팀 · 2026년 4월</p>
        </div>
        <div className={s.badge}>피플팀</div>
      </div>

      {/* KPI 카드 */}
      <div className={s.kpiGrid}>
        {KPI_CARDS.map((card) => (
          <div key={card.label} className={s.kpiCard}>
            <div className={s.kpiTop}>
              <span className={s.kpiIcon}>{card.icon}</span>
              <span className={`${s.kpiChange} ${card.changeType === 'up' ? s.changeUp : s.changeDown}`}>
                {card.change}
              </span>
            </div>
            <div className={s.kpiValue}>
              {card.value}
              <span className={s.kpiUnit}>{card.unit}</span>
            </div>
            <div className={s.kpiLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 중간 행: 부서별 인원 + 인력 구성 */}
      <div className={s.midRow}>
        {/* 부서별 인원 분포 */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>부서별 인원 분포</h2>
          <div className={s.deptList}>
            {DEPARTMENTS.map((dept) => (
              <div key={dept.name} className={s.deptRow}>
                <span className={s.deptName}>{dept.name}</span>
                <div className={s.barTrack}>
                  <div
                    className={s.barFill}
                    style={{
                      width: `${(dept.count / MAX_DEPT_COUNT) * 100}%`,
                      background: dept.color,
                    }}
                  />
                </div>
                <span className={s.deptCount}>{dept.count}명</span>
              </div>
            ))}
          </div>
        </div>

        {/* 인력 구성 */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>인력 구성</h2>

          {/* 성비 */}
          <div className={s.compositionSection}>
            <p className={s.compositionLabel}>성별 비율</p>
            <div className={s.genderBar}>
              <div
                className={s.genderMale}
                style={{ width: `${GENDER_RATIO.male}%` }}
              >
                남 {GENDER_RATIO.male}%
              </div>
              <div
                className={s.genderFemale}
                style={{ width: `${GENDER_RATIO.female}%` }}
              >
                여 {GENDER_RATIO.female}%
              </div>
            </div>
          </div>

          {/* 연령대 */}
          <div className={s.compositionSection}>
            <p className={s.compositionLabel}>연령대 분포</p>
            <div className={s.ageGroups}>
              {AGE_GROUPS.map((ag) => (
                <div key={ag.label} className={s.ageItem}>
                  <div className={s.ageBarWrapper}>
                    <div
                      className={s.ageBar}
                      style={{ height: `${ag.percent * 2}px` }}
                    />
                  </div>
                  <span className={s.agePercent}>{ag.percent}%</span>
                  <span className={s.ageLabel}>{ag.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 재직 유형 */}
          <div className={s.compositionSection}>
            <p className={s.compositionLabel}>재직 유형</p>
            <div className={s.employmentTypes}>
              <div className={s.empType}>
                <span className={s.empDot} style={{ background: '#5B5FC7' }} />
                <span>정규직</span>
                <span className={s.empValue}>204명</span>
              </div>
              <div className={s.empType}>
                <span className={s.empDot} style={{ background: '#A5B4FC' }} />
                <span>계약직</span>
                <span className={s.empValue}>31명</span>
              </div>
              <div className={s.empType}>
                <span className={s.empDot} style={{ background: '#DDD6FE' }} />
                <span>파트타임</span>
                <span className={s.empValue}>12명</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 행: 최근 입사자 + 이번 달 일정 */}
      <div className={s.bottomRow}>
        {/* 최근 입사자 */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>이번 달 입사자</h2>
          <table className={s.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>부서</th>
                <th>직책</th>
                <th>입사일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_HIRES.map((hire) => (
                <tr key={hire.name}>
                  <td className={s.tdName}>{hire.name}</td>
                  <td>{hire.dept}</td>
                  <td className={s.tdPosition}>{hire.position}</td>
                  <td className={s.tdDate}>{hire.date}</td>
                  <td>
                    <span
                      className={`${s.statusBadge} ${hire.status === '온보딩 중' ? s.statusOnboarding : s.statusDone}`}
                    >
                      {hire.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 이번 달 주요 일정 */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>4월 주요 일정</h2>
          <div className={s.scheduleList}>
            {SCHEDULES.map((sch) => {
              const typeInfo = SCHEDULE_TYPE_LABELS[sch.type] ?? { label: sch.type, color: '#999' };
              return (
                <div key={sch.title} className={s.scheduleItem}>
                  <div className={s.scheduleDate}>{sch.date}</div>
                  <div className={s.scheduleContent}>
                    <div className={s.scheduleTitle}>{sch.title}</div>
                    <div className={s.scheduleMeta}>
                      <span
                        className={s.scheduleTag}
                        style={{ background: typeInfo.color + '1A', color: typeInfo.color }}
                      >
                        {typeInfo.label}
                      </span>
                      <span className={s.scheduleParticipants}>👤 {sch.participants}명</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
