import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { api } from '../api/client';

export interface UserInfo {
  id: number;
  name: string;
  phone_number: string;
  photo_100px_uri?: string;
  photo_400px_uri?: string;
}

interface AuthContextType {
  user: UserInfo | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (phoneNumber: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 앱 시작 시 토큰 확인 → 사용자 정보 복원
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        // 저장된 사용자 정보로 즉시 로그인 상태 표시
        const stored = localStorage.getItem('user_info');
        if (stored) {
          setUser(JSON.parse(stored));
          setIsLoggedIn(true);
        }

        // /api/auth/me로 토큰 유효성 검증
        const res = await api.get('/api/auth/me');
        if (res.data) {
          const prev = stored ? JSON.parse(stored) : {};
          const userData: UserInfo = {
            id: res.data.user_id ?? res.data.id,
            name: res.data.name,
            phone_number: res.data.phone_number,
            // /api/auth/me에는 사진이 없으므로 기존 저장값 유지
            photo_100px_uri: res.data.photo_100px_uri ?? prev.photo_100px_uri,
            photo_400px_uri: res.data.photo_400px_uri ?? prev.photo_400px_uri,
          };
          setUser(userData);
          setIsLoggedIn(true);
          localStorage.setItem('user_info', JSON.stringify(userData));
        }
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        setUser(null);
        setIsLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (phoneNumber: string, password: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { phone_number: phoneNumber, password });

      const token = data.token || data.access_token;
      localStorage.setItem('auth_token', token);

      const userData: UserInfo = {
        id: data.user?.id ?? data.user?.pk,
        name: data.user?.name,
        phone_number: data.user?.phone_number,
        photo_100px_uri: data.user?.photo_100px_uri,
        photo_400px_uri: data.user?.photo_400px_uri,
      };
      localStorage.setItem('user_info', JSON.stringify(userData));

      setUser(userData);
      setIsLoggedIn(true);
      setIsLoading(false);
      return { success: true };
    } catch (error) {
      setUser(null);
      setIsLoggedIn(false);
      setIsLoading(false);
      return {
        success: false,
        message: error instanceof Error ? error.message : '로그인에 실패했습니다.',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    localStorage.removeItem('saved_phone');
    localStorage.removeItem('saved_password');
    localStorage.removeItem('remember_me');
    setUser(null);
    setIsLoggedIn(false);
  };

  const value = useMemo(
    () => ({ user, isLoggedIn, isLoading, login, logout }),
    [user, isLoggedIn, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
