import { useNavigate } from 'react-router-dom';
import { MENU_CONFIG } from '../../config/menuConfig';
import s from './Home.module.css';

const MEMBERS = MENU_CONFIG.filter((m) => m.image && m.id !== 'do-gilrok');

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className={s.page}>
      {/* Hero */}
      <section className={s.hero}>
        <p className={s.heroBadge}>BUTFITSEOUL FDE 1기</p>
        <h1 className={s.heroTitle}>
          현장의 문제를<br />직접 해결하는 사람
        </h1>
        <p className={s.heroDesc}>
          개발팀에 요청하고 기다리지 않는다.<br />
          내 업무에 필요한 도구를 직접 기획하고, 직접 만들고, 직접 배포한다.
        </p>
      </section>

      {/* FDE란 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>FDE란</h2>
        <div className={s.whatCard}>
          <p>
            <strong>F</strong>orward <strong>D</strong>eployed <strong>E</strong>ngineer.
            팔란티어가 만든 개념으로, 고객 현장에 직접 배치되어 문제를 코드로 해결하는 엔지니어입니다.
          </p>
          <p>
            버핏서울 FDE는 이 철학을 내부에 적용합니다.
            <strong>각자의 업무 현장에서 필요한 도구를 내 손으로 만드는 사람</strong>이 되는 것.
            데이터 대시보드가 필요하면 직접 만들고, 반복 업무를 자동화할 도구가 필요하면 직접 만듭니다.
          </p>
        </div>
      </section>

      {/* 작업 방식 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>작업 방식 — 한 팀처럼</h2>
        <div className={s.ruleGrid}>
          <div className={s.ruleCard}>
            <span className={s.ruleIcon}>🧑‍🤝‍🧑</span>
            <div>
              <h3>격리 없는 공동 놀이터</h3>
              <p>EC2 하나, GitHub 레포 하나, DB 하나 — 8명 전원이 공유합니다. 누구든 무엇이든 고칠 수 있고, 문제가 생기면 같이 해결합니다.</p>
            </div>
          </div>
          <div className={s.ruleCard}>
            <span className={s.ruleIcon}>🔧</span>
            <div>
              <h3>프론트 + 백 + DB 모두 내 손으로</h3>
              <p>필요한 API는 직접 만들고, 필요한 DB 테이블도 직접 추가합니다. "운영팀에 요청" 같은 건 없습니다.</p>
            </div>
          </div>
          <div className={s.ruleCard}>
            <span className={s.ruleIcon}>🚀</span>
            <div>
              <h3>직접 배포, 즉시 반영</h3>
              <p><code className={s.code}>./deploy.sh</code> 한 줄이면 fde.butfitvolt.click에 즉시 반영. 누구의 허락도 필요 없습니다.</p>
            </div>
          </div>
          <div className={s.ruleCard}>
            <span className={s.ruleIcon}>🌐</span>
            <div>
              <h3>GitHub에서 모든 과정 투명하게</h3>
              <p>기획부터 코드, 리뷰, 배포까지 전부 GitHub에서. PR로 서로의 작업을 보고 배웁니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 처음 시작할 때 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>처음 시작할 때 (필수 순서)</h2>

        <div className={s.warning}>
          <span className={s.warningIcon}>⚠️</span>
          <div>
            <strong>1번 단계를 건너뛰면 GitHub 활동이 랭킹에 집계되지 않습니다.</strong>
            <p>GitHub이 내 커밋을 내 계정과 연결하려면 반드시 GitHub에 등록된 이메일로 git config를 해야 합니다.</p>
          </div>
        </div>

        <div className={s.flowList}>
          <div className={s.flowItem}>
            <div className={s.flowNum}>1</div>
            <div>
              <h3>Git 사용자 설정 (1회만)</h3>
              <pre className={s.codeBlock}>{`git config --global user.email "내-GitHub-이메일"
git config --global user.name "내-GitHub-username"`}</pre>
              <p>이메일은 <a href="https://github.com/settings/emails" target="_blank" rel="noopener noreferrer" className={s.link}>github.com/settings/emails</a>에서 확인.</p>
            </div>
          </div>

          <div className={s.flowItem}>
            <div className={s.flowNum}>2</div>
            <div>
              <h3>레포 클론 + 의존성 설치</h3>
              <pre className={s.codeBlock}>{`git clone https://github.com/gilrokdo1/fde-butfitvolt.git
cd fde-butfitvolt/frontend
pnpm install`}</pre>
            </div>
          </div>

          <div className={s.flowItem}>
            <div className={s.flowNum}>3</div>
            <div>
              <h3>개발 서버 실행</h3>
              <pre className={s.codeBlock}>{`pnpm dev:erp   # http://localhost:5173`}</pre>
            </div>
          </div>

          <div className={s.flowItem}>
            <div className={s.flowNum}>4</div>
            <div>
              <h3>작업 → 커밋 → 배포</h3>
              <pre className={s.codeBlock}>{`git pull --rebase
# ... 코드 수정 ...
git commit -m "feat: 이름 — 기능 설명"
git push
./deploy.sh erp`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* 랭킹 시스템 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>랭킹 시스템</h2>
        <div className={s.whatCard}>
          <p>
            <button className={s.inlineLink} onClick={() => navigate('/fde')}>/fde 페이지</button>
            에 8명 멤버의 <strong>문제해결 점수 랭킹</strong>이 표시됩니다.
          </p>
          <p>
            <strong>페이지 방문수</strong>(실시간) + <strong>GitHub 활동</strong>(실시간) + <strong>문제해결 점수</strong>(매일 03시 AI 평가).
            문제해결 점수는 상대 비교가 아닌 <strong>절대점수(0~100)</strong>로, 실제로 현장의 문제를 해결했는지만 봅니다.
            거창한 계획에 비해 완성도가 낮거나, 만들어놓고 아무도 안 쓰면 낮은 점수가 나옵니다.
          </p>
        </div>
      </section>

      {/* 멤버 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>1기 멤버</h2>
        <div className={s.memberGrid}>
          {MEMBERS.map((m) => (
            <button key={m.id} className={s.memberCard} onClick={() => navigate(m.items[0]?.to ?? '/')}>
              <img src={m.image} alt={m.label} className={s.memberAvatar} />
              <span className={s.memberName}>{m.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 마무리 */}
      <section className={s.outro}>
        <p className={s.outroText}>
          개발팀에 요청하고 기다리지 않는다.<br />
          <strong>내 현장의 문제를 내가 직접 해결한다. 그게 FDE입니다.</strong>
        </p>
      </section>
    </div>
  );
}
