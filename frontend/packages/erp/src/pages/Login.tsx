import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';
import s from './Login.module.css';

// 피보나치 스파이럴 배경 애니메이션
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DOT_COUNT = 500;
const ANIMATION_DURATION = 4000;

function SpiralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.45;

    for (let i = 0; i < DOT_COUNT; i++) {
      const frac = (i + 0.5) / DOT_COUNT;
      const r = Math.sqrt(frac) * maxR;
      const theta = i * GOLDEN_ANGLE + timestamp * 0.0002;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);

      const phase = (timestamp % ANIMATION_DURATION) / ANIMATION_DURATION;
      const wave = Math.sin((phase + frac) * Math.PI * 2);
      const scale = 1.2 + wave * 0.8;
      const opacity = 0.08 + (0.12 * (0.5 + wave * 0.5)) * (1 - frac * 0.5);
      const dotR = scale * (1.5 - frac * 0.8);

      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className={s.spiralCanvas} />;
}

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading, isLoggedIn } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // 페이지 로드 시 자동 로그인
  useEffect(() => {
    if (isLoggedIn) return;

    const savedRememberMe = localStorage.getItem('remember_me') === 'true';
    const savedPhone = localStorage.getItem('saved_phone');
    const savedPassword = localStorage.getItem('saved_password');

    if (savedRememberMe && savedPhone && savedPassword) {
      setPhoneNumber(savedPhone);
      setPassword(savedPassword);
      setRememberMe(true);

      const autoLogin = async () => {
        const result = await login(savedPhone, savedPassword);
        if (!result.success) {
          localStorage.removeItem('saved_phone');
          localStorage.removeItem('saved_password');
          localStorage.removeItem('remember_me');
          setError('자동 로그인에 실패했습니다. 다시 로그인해주세요.');
        }
      };
      autoLogin();
    }
  }, [isLoggedIn]);

  // 로그인 후 리다이렉트 (애니메이션 적용)
  useEffect(() => {
    if (isLoggedIn && !isExiting) {
      setIsExiting(true);
      setTimeout(() => navigate('/'), 600);
    }
  }, [isLoggedIn, navigate, isExiting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setError('올바른 전화번호를 입력해주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    const result = await login(cleanPhone, password);

    if (result.success) {
      if (rememberMe) {
        localStorage.setItem('saved_phone', cleanPhone);
        localStorage.setItem('saved_password', password);
        localStorage.setItem('remember_me', 'true');
      } else {
        localStorage.removeItem('saved_phone');
        localStorage.removeItem('saved_password');
        localStorage.removeItem('remember_me');
      }
      setIsExiting(true);
      setTimeout(() => navigate('/'), 600);
    } else {
      setError(result.message || '로그인에 실패했습니다.');
    }
  };

  return (
    <div className={clsx(s.loginContainer, 'page-transition', isExiting && s.exiting)}>
      <div className={s.loginLeft}>
        <SpiralBackground />
        <div className={s.loginLogo}>
          <span className={s.loginBrand}>BUTFITSEOUL</span>
          <h1>FDE 1기</h1>
        </div>
        <div className={s.loginFooter}>
          <p>&copy;2026 BUTFITSEOUL. All Rights Reserved.</p>
        </div>
      </div>

      <div className={s.loginRight}>
        <div className={s.loginFormWrapper}>
          <h2 className={s.loginTitle}>FDE 1기 로그인</h2>

          <form onSubmit={handleSubmit} className={s.loginForm}>
            <div className={s.inputGroup}>
              <input
                type="tel"
                placeholder="휴대전화번호 ('-' 제외)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading}
                className={s.loginInput}
                autoComplete="tel"
              />
            </div>

            <div className={s.inputGroup}>
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className={s.loginInput}
                autoComplete="current-password"
              />
            </div>

            {error && <div className={s.errorMessage}>{error}</div>}

            <div className={s.rememberMeWrapper}>
              <label className={s.rememberMeLabel}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={s.rememberMeCheckbox}
                />
                <span>자동 로그인</span>
              </label>
            </div>

            <button type="submit" disabled={isLoading} className={s.loginButton}>
              {isLoading ? (
                <>
                  로그인 중
                  <span className={s.loadingDots}>
                    <span className={s.loadingDot}>.</span>
                    <span className={s.loadingDot}>.</span>
                    <span className={s.loadingDot}>.</span>
                  </span>
                </>
              ) : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
