import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRanking, getGithubStats, type MemberRanking, type GithubStat } from '../../api/fde';
import { MENU_CONFIG } from '../../config/menuConfig';
import s from './FDE1.module.css';

const MEMBER_MENU = MENU_CONFIG.filter((m) => m.image && m.id !== 'do-gilrok');

function getMemberImage(name: string): string | undefined {
  return MEMBER_MENU.find((m) => m.label === name)?.image;
}

function getMemberPath(name: string): string {
  const menu = MEMBER_MENU.find((m) => m.label === name);
  return menu?.items[0]?.to ?? '/fde';
}

export default function FDE1() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<MemberRanking[]>([]);
  const [githubStats, setGithubStats] = useState<GithubStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getRanking().then((r) => setRanking(r.data.ranking)),
      getGithubStats().then((r) => setGithubStats(r.data.stats)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getGithub = (name: string) => githubStats.find((g) => g.member_name === name);

  if (loading) {
    return <div className={s.container}><p className={s.loading}>로딩 중...</p></div>;
  }

  return (
    <div className={s.container}>
      <h1 className={s.title}>FDE 1기</h1>
      <p className={s.desc}>문제해결 점수 기준 랭킹</p>

      <div className={s.rankingList}>
        {ranking.map((member) => {
          const gh = getGithub(member.member_name);
          const image = getMemberImage(member.member_name);

          return (
            <button
              key={member.member_name}
              className={`${s.rankItem} ${member.rank <= 3 ? s.topRank : ''}`}
              onClick={() => navigate(getMemberPath(member.member_name))}
            >
              <span className={s.rank}>#{member.rank}</span>

              {image ? (
                <img src={image} alt={member.member_name} className={s.avatar} />
              ) : (
                <div className={s.avatarFallback}>{member.member_name[0]}</div>
              )}

              <div className={s.info}>
                <span className={s.name}>{member.member_name}</span>
                <span className={s.score}>{member.problem_score}점</span>
              </div>

              <div className={s.stats}>
                <span className={s.stat}>방문 {member.visit_count}</span>
                {gh && (
                  <>
                    <span className={s.stat}>PR {gh.pr_count}</span>
                    <span className={s.stat}>커밋 {gh.commit_count}</span>
                  </>
                )}
              </div>

              {member.evaluated_at && (
                <span className={s.evaluated}>
                  {new Date(member.evaluated_at).toLocaleDateString('ko-KR')} 평가
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
