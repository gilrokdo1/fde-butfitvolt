import { useEffect, useState } from 'react';
import { getRanking, getGithubStats, getCommits, type MemberRanking, type GithubStat, type CommitEntry } from '../../api/fde';
import { MENU_CONFIG } from '../../config/menuConfig';
import s from './FDE1.module.css';

const MEMBER_MENU = MENU_CONFIG.filter((m) => m.image);

const MEMBER_COLORS: Record<string, string> = {
  '도길록':  '#5B5FC7',
  '김동하':  '#E86343',
  '김소연':  '#48B678',
  '김영신':  '#F5A623',
  '박민규':  '#9B59B6',
  '이예원':  '#E91E8C',
  '최재은':  '#00BCD4',
  '최지희':  '#FF5722',
  '최치환':  '#607D8B',
};

function getMemberImage(name: string): string | undefined {
  return MEMBER_MENU.find((m) => m.label === name)?.image;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function formatEvaluated(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} 평가`;
}

export default function FDE1() {
  const [ranking, setRanking] = useState<MemberRanking[]>([]);
  const [githubStats, setGithubStats] = useState<GithubStat[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'git'>('ranking');

  useEffect(() => {
    Promise.all([
      getRanking().then((r) => setRanking(r.data.ranking)),
      getGithubStats().then((r) => setGithubStats(r.data.stats)),
      getCommits().then((r) => setCommits(r.data.commits)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getGithub = (name: string) => githubStats.find((g) => g.member_name === name);

  if (loading) {
    return <div className={s.container}><p className={s.loading}>로딩 중...</p></div>;
  }

  const gitPanel = (
    <div className={s.gitPanel}>
      <h2 className={s.panelTitle}>Git 히스토리</h2>
      <div className={s.commitList}>
        {commits.length === 0 && (
          <p className={s.emptyMsg}>커밋 데이터를 불러오는 중...</p>
        )}
        {commits.map((c) => {
          const color = c.member_name ? (MEMBER_COLORS[c.member_name] ?? '#9ca3af') : '#9ca3af';
          return (
            <div key={c.sha} className={s.commitItem}>
              <div className={s.commitDot} style={{ background: color }} />
              <div className={s.commitBody}>
                <div className={s.commitMeta}>
                  {c.member_name && (
                    <span className={s.commitAuthor} style={{ color }}>
                      {c.member_name}
                    </span>
                  )}
                  {!c.member_name && c.author_login && (
                    <span className={s.commitAuthor} style={{ color: '#9ca3af' }}>
                      @{c.author_login}
                    </span>
                  )}
                  <span className={s.commitDate}>{formatDate(c.date)}</span>
                </div>
                <p className={s.commitMessage}>{c.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const rankingPanel = (
    <div className={s.rankingPanel}>
      <h2 className={s.panelTitle}>문제해결 점수 랭킹</h2>
      <div className={s.rankingList}>
        {ranking.map((member) => {
          const gh = getGithub(member.member_name);
          const image = getMemberImage(member.member_name);
          const color = MEMBER_COLORS[member.member_name] ?? '#5B5FC7';
          const isTop3 = member.rank <= 3;

          return (
            <div
              key={member.member_name}
              className={`${s.rankItem} ${isTop3 ? s.topRank : ''}`}
              style={isTop3 ? { borderColor: color } : undefined}
            >
              {/* 상단: 순위 + 아바타 + 이름 + 점수 */}
              <div className={s.cardTop}>
                <span className={s.rank} style={isTop3 ? { color } : undefined}>
                  #{member.rank}
                </span>
                {image ? (
                  <img src={image} alt={member.member_name} className={s.avatar} />
                ) : (
                  <div className={s.avatarFallback} style={{ background: color }}>
                    {member.member_name[0]}
                  </div>
                )}
                <div className={s.nameBlock}>
                  <span className={s.name}>{member.member_name}</span>
                  {member.evaluated_at && (
                    <span className={s.evaluatedAt}>{formatEvaluated(member.evaluated_at)}</span>
                  )}
                </div>
                <span className={s.score} style={{ color }}>{member.problem_score}점</span>
              </div>

              {/* 중간: 통계 뱃지 */}
              <div className={s.badges}>
                <span className={s.badge}>방문 {member.visit_count}</span>
                {gh && gh.pr_count > 0 && (
                  <span className={s.badge}>PR {gh.pr_count}</span>
                )}
                {gh && gh.commit_count > 0 && (
                  <span className={s.badge}>커밋 {gh.commit_count}</span>
                )}
                {(!gh || (gh.pr_count === 0 && gh.commit_count === 0)) && (
                  <span className={s.badgeEmpty}>GitHub 활동 없음</span>
                )}
              </div>

              {/* 하단: 에이전트 평가 문장 */}
              {member.score_reason ? (
                <p className={s.reason}>"{member.score_reason}"</p>
              ) : (
                <p className={s.reasonEmpty}>아직 평가가 없습니다</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={s.container}>
      <div className={s.header}>
        <h1 className={s.title}>FDE 1기</h1>
      </div>

      {/* 모바일 탭 */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${activeTab === 'ranking' ? s.tabActive : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          랭킹
        </button>
        <button
          className={`${s.tab} ${activeTab === 'git' ? s.tabActive : ''}`}
          onClick={() => setActiveTab('git')}
        >
          Git 히스토리
        </button>
      </div>

      {/* 데스크탑: 좌우 분할 */}
      <div className={s.splitLayout}>
        {rankingPanel}
        {gitPanel}
      </div>

      {/* 모바일: 탭 전환 */}
      <div className={s.mobileContent}>
        {activeTab === 'ranking' ? rankingPanel : gitPanel}
      </div>
    </div>
  );
}
