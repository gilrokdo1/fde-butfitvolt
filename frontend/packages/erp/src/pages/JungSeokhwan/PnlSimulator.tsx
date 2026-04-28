import { useState } from 'react';
import s from './PnlSimulator.module.css';

export default function PnlSimulator() {
  const [vatMode, setVatMode] = useState<'minus' | 'plus'>('minus');

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>BG P&L 시뮬레이터</h1>
        </div>
        <div className={s.vatToggle}>
          <span className={s.vatLabel}>기준</span>
          <button
            type="button"
            className={vatMode === 'minus' ? s.vatBtnActive : s.vatBtn}
            onClick={() => setVatMode('minus')}
          >
            VAT-
          </button>
          <button
            type="button"
            className={vatMode === 'plus' ? s.vatBtnActive : s.vatBtn}
            onClick={() => setVatMode('plus')}
          >
            VAT+
          </button>
        </div>
      </header>
    </div>
  );
}