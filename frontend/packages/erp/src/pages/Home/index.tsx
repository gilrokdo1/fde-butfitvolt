import { useAuth } from '../../contexts/AuthContext';
import { FDE_MEMBERS } from '../../config/menuConfig';
import s from './Home.module.css';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className={s.container}>
      <h1 className={s.greeting}>
        <span style={{ fontFamily: 'Tossface' }}>&#x1F44B;</span>
        안녕하세요, {user?.name ?? '멤버'}님!
      </h1>
      <p className={s.desc}>
        버핏서울 FDE 1기에 오신 걸 환영합니다. 사이드바에서 자기 이름을 클릭해 시작하세요.
      </p>

      <h2 className={s.sectionTitle}>1기 멤버</h2>
      <div className={s.memberGrid}>
        {FDE_MEMBERS.map((m) => (
          <div key={m.name} className={s.memberCard}>
            <img
              src={m.image}
              alt={m.name}
              className={s.avatar}
              onError={(e) => {
                (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#5B5FC7"/><text x="32" y="40" text-anchor="middle" fill="white" font-size="24">${m.name[0]}</text></svg>`
                )}`;
              }}
            />
            <span className={s.name}>{m.name}</span>
            <span className={s.team}>{m.team}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
