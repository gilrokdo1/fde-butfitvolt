import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import s from './Login.module.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.container}>
      <form className={s.card} onSubmit={handleSubmit}>
        <h1 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4AA;</span>
          FDE 1기
        </h1>
        <p className={s.subtitle}>버핏서울 Frontend Developer Education</p>

        <div className={s.field}>
          <label className={s.label}>아이디</label>
          <input
            className={s.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디 입력"
            autoComplete="username"
          />
        </div>

        <div className={s.field}>
          <label className={s.label}>비밀번호</label>
          <input
            className={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력"
            autoComplete="current-password"
          />
        </div>

        {error && <p className={s.error}>{error}</p>}

        <button className={s.button} type="submit" disabled={loading || !username || !password}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
