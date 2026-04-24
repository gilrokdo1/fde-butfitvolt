import s from './Budget.module.css';

export default function Budget() {
  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4B0;</span> 예산관리
        </h2>
        <p className={s.subtitle}>지점별·카테고리별 예산과 집행 현황을 관리합니다.</p>
      </header>

      <div className={s.placeholder}>
        <span style={{ fontFamily: 'Tossface', fontSize: 56 }}>&#x1F6E0;&#xFE0F;</span>
        <p className={s.placeholderTitle}>준비 중</p>
        <p className={s.placeholderHint}>예산 기획·집행 현황·편차 분석 기능이 이곳에 들어갑니다.</p>
      </div>
    </section>
  );
}
