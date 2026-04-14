import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://fde.butfitvolt.click';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// JWT 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → 로그인 페이지로
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
