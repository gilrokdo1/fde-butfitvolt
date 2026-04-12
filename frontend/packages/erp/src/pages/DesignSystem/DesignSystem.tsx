import { useState, useCallback, useRef, useEffect } from 'react';
import s from './DesignSystem.module.css';

/* ============================================
   Nav 구조
   ============================================ */
const NAV = [
  { id: 'intro', label: '소개', group: '시작하기' },
  { id: 'colors', label: 'Colors', group: '파운데이션' },
  { id: 'typography', label: 'Typography', group: '파운데이션' },
  { id: 'spacing', label: 'Spacing', group: '파운데이션' },
  { id: 'shadow', label: 'Shadow & Radius', group: '파운데이션' },
  { id: 'page-layout', label: 'Page Layout', group: '레이아웃' },
  { id: 'table-guide', label: 'Table', group: '레이아웃' },
  { id: 'buttons', label: 'Buttons', group: '컴포넌트' },
  { id: 'status', label: 'Status', group: '컴포넌트' },
  { id: 'table-colors', label: 'Table Colors', group: '컴포넌트' },
  { id: 'tokens', label: 'All Tokens', group: '레퍼런스' },
];

const TOC: Record<string, string[]> = {
  intro: ['BVDS란', '지원 플랫폼', '사용 방법'],
  colors: ['Primary', 'Text', 'Background', 'Border'],
  typography: ['Scale', 'Font Weight'],
  spacing: ['4px Base Scale'],
  shadow: ['Shadow', 'Border Radius'],
  'page-layout': ['Container', 'Responsive Breakpoints', 'Page Structure'],
  'table-guide': ['Basic Structure', 'Column Alignment', 'Column Width', 'Sticky Header', 'Sticky Column'],
  buttons: ['Variant', 'Size', 'Utility'],
  status: ['Success / Error / Warning'],
  'table-colors': ['P&L 계층형'],
  tokens: ['전체 레퍼런스'],
};

/* ============================================
   통합된 토큰 데이터
   ============================================ */
const COLORS = {
  primary: [
    { name: 'Indigo', var: '--primary', value: '#5B5FC7' },
  ],
  primaryDerived: [
    { name: 'Hover', var: '--primary-hover', value: '#4B4FB7' },
    { name: 'Light', var: '--primary-light', value: '#6366F1' },
  ],
  text: [
    { name: 'Primary', var: '--text-primary', value: '#1A1A1A', desc: '제목, 강조' },
    { name: 'Secondary', var: '--text-secondary', value: '#666666', desc: '본문, 설명' },
    { name: 'Tertiary', var: '--text-tertiary', value: '#999999', desc: '보조, 캡션' },
    { name: 'Disabled', var: '--text-disabled', value: '#CCCCCC', desc: '비활성' },
  ],
  bg: [
    { name: 'Primary', var: '--bg-primary', value: '#FFFFFF', desc: '기본 배경' },
    { name: 'Secondary', var: '--bg-secondary', value: '#F7F8FA', desc: '카드, 섹션, 페이지' },
    { name: 'Hover', var: '--bg-hover', value: '#F3F4F6', desc: '호버, 선택' },
  ],
  border: [
    { name: 'Primary', var: '--border-primary', value: '#E5E7EB' },
    { name: 'Secondary', var: '--border-secondary', value: '#F0F0F0' },
    { name: 'Focus', var: '--border-focus', value: '#5B5FC7' },
  ],
};

const STATUS = [
  { name: 'Success', var: '--color-success', value: '#10b981', light: '#d1fae5', desc: '성공, 완료, 증가', tokens: ['--color-success', '--color-success-light'] },
  { name: 'Error', var: '--color-error', value: '#dc2626', light: '#fee2e2', desc: '오류, 삭제, 감소', tokens: ['--color-error', '--color-error-light', '--color-error-bg'] },
  { name: 'Warning', var: '--color-warning', value: '#f59e0b', light: '#fef3c7', desc: '주의, 변경, 경고', tokens: ['--color-warning', '--color-warning-light', '--color-warning-bg'] },
];

const TABLE_COLORS = [
  { name: 'Sales', text: '#16a34a', levels: ['#bbf7d0', '#dcfce7', '#f0fdf4'] },
  { name: 'COS', text: '#dc2626', levels: ['#fecaca', '#fee2e2', '#fef2f2'] },
  { name: 'Profit', text: '#0d9488', levels: ['#99f6e4', '#ccfbf1', '#f0fdfa'] },
  { name: 'SG&A', text: '#d97706', levels: ['#fde68a', '#fef3c7', '#fefce8'] },
  { name: 'EBITDA', text: '#4f46e5', levels: ['#c7d2fe', '#e0e7ff', '#eef2ff'] },
  { name: 'Cost', text: '#ea580c', levels: ['#fed7aa', '#ffedd5', '#fff7ed'] },
];

const FONTS = [
  { token: '--font-3xl', size: '36px', use: '히어로, 대형 숫자' },
  { token: '--font-2xl', size: '24px', use: '페이지 제목' },
  { token: '--font-xl', size: '20px', use: '섹션 제목' },
  { token: '--font-lg', size: '18px', use: '카드 제목' },
  { token: '--font-md', size: '16px', use: '서브 제목' },
  { token: '--font-base', size: '14px', use: '본문, 테이블' },
  { token: '--font-sm', size: '13px', use: '라벨, 캡션' },
  { token: '--font-xs', size: '12px', use: '배지 (모바일 13px)' },
];

const WEIGHTS = [
  { name: 'Normal', var: '--font-normal', value: '400' },
  { name: 'Medium', var: '--font-medium', value: '500' },
  { name: 'Semibold', var: '--font-semibold', value: '600' },
  { name: 'Bold', var: '--font-bold', value: '700' },
];

const SPACES = [
  { token: 'space-1', px: 4 }, { token: 'space-2', px: 8 },
  { token: 'space-3', px: 12 }, { token: 'space-4', px: 16 },
  { token: 'space-5', px: 20 }, { token: 'space-6', px: 24 },
  { token: 'space-8', px: 32 }, { token: 'space-10', px: 40 },
  { token: 'space-12', px: 48 },
];

const SHADOWS = [
  { name: 'Small', var: '--shadow-sm' },
  { name: 'Medium', var: '--shadow-md' },
  { name: 'Large', var: '--shadow-lg' },
];

const RADII = [
  { name: 'SM', var: '--radius-sm', value: '4px' },
  { name: 'MD', var: '--radius-md', value: '6px' },
  { name: 'LG', var: '--radius-lg', value: '8px' },
  { name: 'XL', var: '--radius-xl', value: '12px' },
];

const BREAKPOINTS = [
  { label: 'Desktop', query: '> 1400px', maxWidth: '1400px', padding: '16px 24px' },
  { label: 'Laptop', query: '≤ 1400px', maxWidth: '100%', padding: '12px 20px' },
  { label: 'Tablet', query: '≤ 1024px', maxWidth: '100%', padding: '12px 16px' },
  { label: 'Mobile', query: '≤ 768px', maxWidth: '100%', padding: '12px' },
  { label: 'Small', query: '≤ 480px', maxWidth: '100%', padding: '8px' },
];

const CONTAINER_SPEC = [
  { prop: 'max-width', value: '1400px', desc: '페이지 최대 폭 제한' },
  { prop: 'margin', value: '0 auto', desc: '가운데 정렬' },
  { prop: 'padding', value: '16px 24px', desc: '내부 여백 (위아래 16, 좌우 24)' },
];

const TABLE_DEMO = [
  { branch: '강남', member: '김버핏', sessions: 24, amount: '1,200,000', status: '활성' },
  { branch: '판교', member: '이볼트', sessions: 16, amount: '800,000', status: '활성' },
  { branch: '역삼', member: '박핏볼', sessions: 8, amount: '400,000', status: '만료' },
];

/* ============================================
   컴포넌트
   ============================================ */
export default function DesignSystem() {
  const [active, setActive] = useState('intro');
  const [toast, setToast] = useState('');
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const copy = useCallback((v: string) => {
    navigator.clipboard.writeText(v);
    setToast(v);
    setTimeout(() => setToast(''), 1200);
  }, []);

  const go = useCallback((id: string) => {
    setActive(id);
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-80px 0px -60% 0px' }
    );
    NAV.forEach(n => { const el = refs.current[n.id]; if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const r = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };

  const groups = NAV.reduce<Record<string, typeof NAV>>((a, n) => {
    (a[n.group] ??= []).push(n);
    return a;
  }, {});

  return (
    <div className={s.bvds}>
      {/* 사이드바 */}
      <aside className={s.sidebar}>
        <div className={s.sidebarBrand}>
          <div className={s.sidebarLogo}>BVDS</div>
          <div className={s.sidebarVersion}>Butfitvolt Design System v1.0</div>
        </div>
        <nav>
          {Object.entries(groups).map(([g, items]) => (
            <div key={g} className={s.navGroup}>
              <div className={s.navGroupTitle}>{g}</div>
              {items.map(n => (
                <button key={n.id} className={`${s.navItem} ${active === n.id ? s.active : ''}`} onClick={() => go(n.id)}>
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className={s.main}>
        <main className={s.content}>

          {/* ── 소개 ── */}
          <section id="intro" ref={r('intro')}>
            <div className={s.hero}>
              <div className={s.heroEyebrow}>BVDS v1.0</div>
              <h1 className={s.heroTitle}>Butfitvolt Design System</h1>
              <p className={s.heroDesc}>
                버핏볼트 ERP 전용 디자인 시스템이에요.
                CSS 변수 기반으로 색상·타이포·간격·그림자를 관리하고, 모든 페이지에 일관된 UI를 제공해요.
              </p>
            </div>

            <h3 className={s.subTitle}>
              지원 플랫폼
              <span className={`${s.platform} ${s.pw}`}>Web</span>{' '}
              <span className={`${s.platform} ${s.pm}`}>Mobile</span>
            </h3>
            <p className={s.sectionDesc}>
              데스크톱과 모바일(≤768px) 모두 지원해요.
              모바일에서는 <span className={s.code}>--font-xs</span>가 13px로, 터치 타겟이 44px로 자동 적용돼요.
            </p>

            <h3 className={s.subTitle}>사용 방법</h3>
            <p className={s.sectionDesc}>
              CSS에서 <span className={s.code}>var(--primary)</span> 형태로 사용해요.
              변수명을 클릭하면 클립보드에 복사돼요.
            </p>
          </section>

          <div className={s.divider} />

          {/* ── Colors ── */}
          <section id="colors" ref={r('colors')} className={s.section}>
            <div className={s.sectionHeader}>
              <h2 className={s.sectionTitle}>Colors</h2>
              <span className={`${s.platform} ${s.pw}`}>Web</span>
              <span className={`${s.platform} ${s.pm}`}>Mobile</span>
            </div>
            <p className={s.sectionDesc}>
              BVDS 색상 토큰은 4단계 체계로 통합됐어요. 비슷한 색상의 중복을 줄이고 명확한 위계를 가져요.
            </p>

            <h3 className={s.subTitle}>Primary — 키컬러</h3>
            <Swatches colors={COLORS.primary} onCopy={copy} size="large" />
            <p className={s.sectionDesc}>파생 (Derived)</p>
            <Swatches colors={COLORS.primaryDerived} onCopy={copy} />

            <h3 className={s.subTitle}>Text — 4단계</h3>
            <p className={s.sectionDesc}>Primary → Secondary → Tertiary → Disabled. 더 세분화하지 않아요.</p>
            <Swatches colors={COLORS.text} onCopy={copy} />

            <h3 className={s.subTitle}>Background — 4단계</h3>
            <Swatches colors={COLORS.bg} onCopy={copy} />

            <h3 className={s.subTitle}>Border</h3>
            <Swatches colors={COLORS.border} onCopy={copy} />
          </section>

          <div className={s.divider} />

          {/* ── Typography ── */}
          <section id="typography" ref={r('typography')} className={s.section}>
            <h2 className={s.sectionTitle}>Typography</h2>
            <p className={s.sectionDesc}>Pretendard 기반 8단계 스케일. 가독성과 시각적 위계를 보장해요.</p>

            <h3 className={s.subTitle}>Scale</h3>
            <table className={s.typoTable}>
              <thead><tr><th>Token</th><th>Size</th><th>용도</th><th>Sample</th></tr></thead>
              <tbody>
                {FONTS.map(f => (
                  <tr key={f.token}>
                    <td><span className={s.typoToken} onClick={() => copy(`var(${f.token})`)}>{f.token}</span></td>
                    <td><span className={s.typoPx}>{f.size}</span></td>
                    <td><span className={s.typoPx}>{f.use}</span></td>
                    <td><span className={s.typoSample} style={{ fontSize: f.size }}>버핏볼트</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className={s.subTitle}>Font Weight</h3>
            <div className={s.weightGrid}>
              {WEIGHTS.map(w => (
                <div key={w.name} className={s.weightCard}>
                  <div className={s.weightAa} style={{ fontWeight: Number(w.value) }}>Aa</div>
                  <div className={s.weightName}>{w.name}</div>
                  <div className={s.weightVal} onClick={() => copy(`var(${w.var})`)}>{w.value}</div>
                </div>
              ))}
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Spacing ── */}
          <section id="spacing" ref={r('spacing')} className={s.section}>
            <h2 className={s.sectionTitle}>Spacing</h2>
            <p className={s.sectionDesc}>4px 베이스 스케일. padding, margin, gap에 일관되게 사용해요.</p>
            <div className={s.spaceList}>
              {SPACES.map(sp => (
                <div key={sp.token} className={s.spaceRow}>
                  <span className={s.spaceLabel} onClick={() => copy(`var(--${sp.token})`)}>{sp.token}</span>
                  <div className={s.spaceBar} style={{ width: `${sp.px * 5}px` }} />
                  <span className={s.spacePx}>{sp.px}px</span>
                </div>
              ))}
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Shadow & Radius ── */}
          <section id="shadow" ref={r('shadow')} className={s.section}>
            <h2 className={s.sectionTitle}>Shadow & Radius</h2>

            <h3 className={s.subTitle}>Shadow</h3>
            <div className={s.shadowGrid}>
              {SHADOWS.map(sh => (
                <div key={sh.name} className={s.shadowBox} style={{ boxShadow: `var(${sh.var})` }} onClick={() => copy(`var(${sh.var})`)}>
                  <div className={s.shadowLabel}>{sh.name}</div>
                  <div className={s.shadowVar}>{sh.var}</div>
                </div>
              ))}
            </div>

            <h3 className={s.subTitle}>Border Radius</h3>
            <div className={s.radiusGrid}>
              {RADII.map(rv => (
                <div key={rv.name} className={s.radiusBox} style={{ borderRadius: rv.value }} onClick={() => copy(`var(${rv.var})`)}>
                  <div className={s.radiusLabel}>{rv.name}</div>
                  <div className={s.radiusVal}>{rv.value}</div>
                </div>
              ))}
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Page Layout ── */}
          <section id="page-layout" ref={r('page-layout')} className={s.section}>
            <h2 className={s.sectionTitle}>Page Layout</h2>
            <p className={s.sectionDesc}>
              모든 데이터 페이지에 적용되는 공통 레이아웃 패턴이에요.
              글로벌 클래스 <span className={s.code}>.metric-container</span>가 기본 컨테이너예요.
            </p>

            <h3 className={s.subTitle}>Container</h3>
            <p className={s.sectionDesc}>
              페이지 본문을 <span className={s.code}>max-width: 1400px</span>로 제한하고
              <span className={s.code}>margin: 0 auto</span>로 가운데 정렬해요.
            </p>
            <table className={s.typoTable}>
              <thead><tr><th>Property</th><th>Value</th><th>설명</th></tr></thead>
              <tbody>
                {CONTAINER_SPEC.map(c => (
                  <tr key={c.prop}>
                    <td><span className={s.code} onClick={() => copy(c.prop)}>{c.prop}</span></td>
                    <td><span className={s.code} onClick={() => copy(c.value)}>{c.value}</span></td>
                    <td><span className={s.typoPx}>{c.desc}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className={s.subTitle}>Responsive Breakpoints</h3>
            <p className={s.sectionDesc}>화면 너비에 따라 padding이 단계적으로 줄어들어요.</p>
            <div className={s.breakpointGrid}>
              {BREAKPOINTS.map(bp => (
                <div key={bp.label} className={s.breakpointCard}>
                  <div className={s.breakpointLabel}>{bp.label}</div>
                  <div className={s.breakpointQuery}>{bp.query}</div>
                  <div className={s.breakpointDemo} style={{ padding: bp.padding }}>
                    <div className={s.breakpointInner} />
                  </div>
                  <div className={s.breakpointMeta}>
                    <span className={s.code} onClick={() => copy(`max-width: ${bp.maxWidth}`)}>{bp.maxWidth}</span>
                    <span className={s.code} onClick={() => copy(`padding: ${bp.padding}`)}>{bp.padding}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 className={s.subTitle}>Page Structure</h3>
            <p className={s.sectionDesc}>일반적인 데이터 페이지의 DOM 구조예요.</p>
            <div className={s.layoutDemo}>
              <div className={s.layoutLabel}>.metric-container</div>
              <div className={s.layoutBox}>
                <div className={s.layoutSlot} style={{ background: 'rgba(91,95,199,0.06)' }}>
                  <span className={s.layoutSlotLabel}>.metric-header</span>
                  <span className={s.layoutSlotDesc}>페이지 제목 + 소스 정보</span>
                </div>
                <div className={s.layoutSlot} style={{ background: 'rgba(16,185,129,0.06)' }}>
                  <span className={s.layoutSlotLabel}>.filter-section</span>
                  <span className={s.layoutSlotDesc}>필터 영역 (지점, 기간 등)</span>
                </div>
                <div className={s.layoutSlot} style={{ background: 'rgba(245,158,11,0.06)' }}>
                  <span className={s.layoutSlotLabel}>.metric-table-container</span>
                  <div className={s.layoutNested}>
                    <div className={s.layoutNestedItem}>.table-header</div>
                    <div className={s.layoutNestedItem}>.table-wrapper &gt; .data-table</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Table Guide ── */}
          <section id="table-guide" ref={r('table-guide')} className={s.section}>
            <div className={s.sectionHeader}>
              <h2 className={s.sectionTitle}>Table</h2>
              <span className={`${s.platform} ${s.pw}`}>Web</span>
            </div>
            <p className={s.sectionDesc}>
              데이터 테이블 구현 시 지켜야 할 공통 패턴이에요.
              글로벌 클래스 <span className={s.code}>.data-table</span>과
              <span className={s.code}>.table-wrapper</span>를 사용해요.
            </p>

            <h3 className={s.subTitle}>Basic Structure</h3>
            <p className={s.sectionDesc}>
              <span className={s.code}>table-layout: fixed</span>로 컬럼 너비를 고정해요.
              짧은 텍스트는 가운데, 긴 텍스트는 왼쪽 정렬 + 말줄임,
              숫자는 오른쪽 정렬 + 헤더도 동일하게 맞춰요.
            </p>
            <div className={s.tableDemoWrap}>
              <table className={s.tableDemo}>
                <thead>
                  <tr>
                    <th style={{ width: 72 }}>지점</th>
                    <th style={{ width: '30%', textAlign: 'left' }}>회원</th>
                    <th style={{ width: 72, textAlign: 'right' }}>수업수</th>
                    <th style={{ width: 110, textAlign: 'right' }}>금액</th>
                    <th style={{ width: 64 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_DEMO.map(row => (
                    <tr key={row.member}>
                      <td>{row.branch}</td>
                      <td className={s.cellEllipsis} style={{ textAlign: 'left' }}>{row.member}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.sessions}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.amount}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={s.subTitle}>Column Alignment</h3>
            <p className={s.sectionDesc}>
              컬럼 내용에 따라 정렬과 너비 전략이 달라져요.
              헤더(th)와 값(td)의 정렬은 반드시 동일하게 맞춰요.
            </p>
            <div className={s.alignGrid}>
              <div className={s.alignCard}>
                <div className={s.alignSample} style={{ textAlign: 'center' }}>강남</div>
                <div className={s.alignLabel}>짧은 텍스트 (지점, 상태)</div>
                <span className={s.code} onClick={() => copy('text-align: center')}>center · 고정 너비</span>
              </div>
              <div className={s.alignCard}>
                <div className={s.alignSample} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>김버핏볼트장이름긴예시</div>
                <div className={s.alignLabel}>긴 텍스트 (이름, 메모)</div>
                <span className={s.code} onClick={() => copy('text-align: left')}>left · 유동 너비 · ellipsis</span>
              </div>
              <div className={s.alignCard}>
                <div className={s.alignSample} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>1,200,000</div>
                <div className={s.alignLabel}>숫자 (금액, 횟수)</div>
                <span className={s.code} onClick={() => copy('text-align: right')}>right · 숫자 맞춤 너비</span>
              </div>
            </div>

            <div className={s.tableDemoWrap}>
              <table className={s.tableDemo}>
                <thead>
                  <tr>
                    <th style={{ width: '25%', textAlign: 'left' }}>컬럼 타입</th>
                    <th style={{ width: '20%' }}>정렬</th>
                    <th style={{ width: '20%' }}>너비</th>
                    <th style={{ width: '35%', textAlign: 'left' }}>규칙</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left' }}>짧은 텍스트</td>
                    <td>center</td>
                    <td>고정 (px)</td>
                    <td style={{ textAlign: 'left' }}>지점, 상태 등 2~4글자</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>긴 텍스트</td>
                    <td>left</td>
                    <td>유동 (%)</td>
                    <td style={{ textAlign: 'left' }}>overflow: hidden + text-overflow: ellipsis</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left' }}>숫자</td>
                    <td>right</td>
                    <td>숫자 맞춤 (px)</td>
                    <td style={{ textAlign: 'left' }}>th도 right · font-variant-numeric: tabular-nums</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className={s.subTitle}>Column Width</h3>
            <p className={s.sectionDesc}>
              <span className={s.code}>table-layout: fixed</span> 사용 시,
              CSS 클래스로 컬럼 너비를 명시적으로 지정해요.
              컬럼 내용이 바뀌어도 레이아웃이 점프하지 않아요.
            </p>
            <div className={s.codeBlock}>
              <div className={s.codeBlockTitle}>너비 전략</div>
              <pre className={s.codeBlockPre}>{`/* 짧은 텍스트 · 숫자 → 고정 px */
.colBranch  \{ width: 72px; \}   /* 지점 */
.colStatus  \{ width: 64px; \}   /* 상태 */
.colCount   \{ width: 72px; \}   /* 횟수 — 숫자 최대폭에 맞춤 */
.colAmount  \{ width: 110px; \}  /* 금액 — 1,200,000 수준 */

/* 긴 텍스트 → 유동 % (남는 공간 흡수) */
.colName    \{ width: 30%; \}    /* 이름, 메모 등 */

/* th, td 모두 같은 클래스 적용 */
<th className=\{s.colBranch\}>지점</th>
<td className=\{s.colBranch\}>\{data\}</td>`}</pre>
            </div>

            <h3 className={s.subTitle}>Sticky Header</h3>
            <p className={s.sectionDesc}>
              테이블 헤더를 <span className={s.code}>position: sticky; top: 0</span>으로 고정해요.
              <span className={s.code}>z-index: 10</span>을 사용해요.
            </p>
            <div className={s.stickyHeaderDemo}>
              <table className={s.tableDemo}>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>지점</th>
                    <th style={{ width: '40%', textAlign: 'left' }}>회원</th>
                    <th style={{ width: 80, textAlign: 'right' }}>수업수</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      <td>지점{i + 1}</td>
                      <td style={{ textAlign: 'left' }}>회원{i + 1}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(i + 1) * 3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={s.subTitle}>Sticky Column</h3>
            <p className={s.sectionDesc}>
              좌측 고정 컬럼은 <span className={s.code}>position: sticky; left: 0</span>을 사용해요.
              <span className={s.code}>min-width</span>와 <span className={s.code}>max-width</span>를 동일하게 설정하고,
              z-index는 td: 5, th: 15로 해요.
            </p>
            <div className={s.stickyColDemo}>
              <table className={s.tableDemo}>
                <thead>
                  <tr>
                    <th className={s.demoStickyCol} style={{ textAlign: 'left' }}>회원</th>
                    <th style={{ textAlign: 'right' }}>1월</th><th style={{ textAlign: 'right' }}>2월</th><th style={{ textAlign: 'right' }}>3월</th><th style={{ textAlign: 'right' }}>4월</th><th style={{ textAlign: 'right' }}>5월</th><th style={{ textAlign: 'right' }}>6월</th><th style={{ textAlign: 'right' }}>7월</th><th style={{ textAlign: 'right' }}>8월</th>
                  </tr>
                </thead>
                <tbody>
                  {['김버핏', '이볼트', '박핏볼'].map(name => (
                    <tr key={name}>
                      <td className={s.demoStickyCol} style={{ textAlign: 'left' }}>{name}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>12</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>14</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>16</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>10</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>18</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>20</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>15</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>22</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Buttons ── */}
          <section id="buttons" ref={r('buttons')} className={s.section}>
            <h2 className={s.sectionTitle}>Buttons</h2>
            <p className={s.sectionDesc}>글로벌 CSS 클래스 기반 버튼이에요.</p>

            <h3 className={s.subTitle}>Variant</h3>
            <div className={s.btnShowcase}>
              <div className={s.btnRow}>
                <span className={s.btnRowLabel}>Primary</span>
                <button className="btn btn-primary">적용</button>
                <button className="btn btn-primary" disabled>비활성</button>
              </div>
              <div className={s.btnRow}>
                <span className={s.btnRowLabel}>Secondary</span>
                <button className="btn btn-secondary">취소</button>
              </div>
              <div className={s.btnRow}>
                <span className={s.btnRowLabel}>Ghost</span>
                <button className="btn btn-ghost">더보기</button>
              </div>
            </div>

            <h3 className={s.subTitle}>Size</h3>
            <div className={s.btnRow}>
              <span className={s.btnRowLabel}>SM / MD / LG</span>
              <button className="btn btn-primary btn-sm">Small</button>
              <button className="btn btn-primary">Default</button>
              <button className="btn btn-primary btn-lg">Large</button>
            </div>

            <h3 className={s.subTitle}>Utility</h3>
            <div className={s.btnRow}>
              <button className="btn-apply">조회</button>
              <button className="btn-download">다운로드</button>
              <button className="btn-quick">초기화</button>
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Status ── */}
          <section id="status" ref={r('status')} className={s.section}>
            <h2 className={s.sectionTitle}>Status Colors</h2>
            <p className={s.sectionDesc}>상태 표현 색상이에요. 각 상태에 light, bg 변형이 있어요.</p>
            <div className={s.statusGrid}>
              {STATUS.map(c => (
                <div key={c.name} className={s.statusCard} style={{ background: c.light, borderColor: c.value }}>
                  <div className={s.statusDot} style={{ background: c.value }} />
                  <div className={s.statusName} style={{ color: c.value }}>{c.name}</div>
                  <div className={s.statusDesc} style={{ color: c.value }}>{c.desc}</div>
                  <div className={s.statusTokens}>
                    {c.tokens.map(t => (
                      <span key={t} className={s.statusToken} style={{ color: c.value }} onClick={() => copy(`var(${t})`)}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className={s.divider} />

          {/* ── Table Colors ── */}
          <section id="table-colors" ref={r('table-colors')} className={s.section}>
            <h2 className={s.sectionTitle}>Table Colors</h2>
            <p className={s.sectionDesc}>P&L 계층형 테이블 전용. 항목별 3단계(L0~L2)로 깊이를 표현해요.</p>
            <div className={s.tcGrid}>
              {TABLE_COLORS.map(tc => (
                <div key={tc.name} className={s.tcCard}>
                  <div className={s.tcHead} style={{ background: tc.levels[0], color: tc.text }}>{tc.name}</div>
                  <div className={s.tcLevels}>
                    {tc.levels.map((lv, i) => (
                      <div key={i} className={s.tcLv} style={{ background: lv }}>L{i}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className={s.divider} />

          {/* ── All Tokens ── */}
          <section id="tokens" ref={r('tokens')} className={s.section}>
            <h2 className={s.sectionTitle}>All Tokens</h2>
            <p className={s.sectionDesc}>index.css에 정의된 전체 CSS 변수 레퍼런스예요.</p>
            <table className={s.refTable}>
              <thead><tr><th>Variable</th><th>Value</th><th>Role</th></tr></thead>
              <tbody>
                {[
                  ...COLORS.primary.map(c => ({ ...c, cat: 'Primary' })),
                  ...COLORS.primaryDerived.map(c => ({ ...c, cat: 'Primary (Derived)' })),
                  ...COLORS.text.map(c => ({ ...c, cat: 'Text' })),
                  ...COLORS.bg.map(c => ({ ...c, cat: 'Background' })),
                  ...COLORS.border.map(c => ({ ...c, cat: 'Border' })),
                  ...STATUS.map(c => ({ name: c.name, var: c.var, value: c.value, cat: 'Status' })),
                ].map(t => (
                  <tr key={t.var}>
                    <td><span className={s.refVar} onClick={() => copy(`var(${t.var})`)}>{t.var}</span></td>
                    <td><span className={s.refDot} style={{ background: t.value }} /><span className={s.refVal}>{t.value}</span></td>
                    <td><span className={s.refVal}>{t.cat} · {t.name}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </main>

        {/* 우측 목차 */}
        <aside className={s.toc}>
          <div className={s.tocLabel}>On this page</div>
          {(TOC[active] || []).map(item => (
            <span key={item} className={s.tocItem}>{item}</span>
          ))}
        </aside>
      </div>

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

function Swatches({ colors, onCopy, size }: { colors: { name: string; var: string; value: string }[]; onCopy: (v: string) => void; size?: 'large' }) {
  return (
    <div className={size === 'large' ? s.colorGridHero : s.colorGrid}>
      {colors.map(c => (
        <div key={c.var} className={size === 'large' ? s.swatchHero : s.swatch} onClick={() => onCopy(`var(${c.var})`)}>
          <div className={size === 'large' ? s.swatchColorHero : s.swatchColor} style={{ background: c.value }} />
          <div className={s.swatchInfo}>
            <div className={size === 'large' ? s.swatchNameHero : s.swatchName}>{c.name}</div>
            <div className={s.swatchVal}>{c.var} · {c.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
