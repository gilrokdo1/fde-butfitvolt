import s from './Soldier76.module.css';

export default function Soldier76() {
  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F3AF;</span> SOLDIER: 76
        </h2>
        <p className={s.subtitle}>
          오버워치 솔져76 풍 1인칭 슈팅. 캔버스를 클릭해 포인터 락을 활성화하세요.
        </p>
      </header>
      <iframe
        src="/soldier76/index.html"
        title="SOLDIER: 76"
        className={s.frame}
        allow="fullscreen; pointer-lock; autoplay"
      />
    </section>
  );
}
