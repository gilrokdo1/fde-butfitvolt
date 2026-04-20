import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  server: {
    port: 5173,
  },
  define: {
    // 프로덕션 빌드 시 VITE_API_URL 미설정이면 프로덕션 URL 사용
    ...(mode === 'production' && !process.env.VITE_API_URL
      ? { 'import.meta.env.VITE_API_URL': JSON.stringify('https://fde.butfitvolt.click') }
      : {}),
  },
}));
