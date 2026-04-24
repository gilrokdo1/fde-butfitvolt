import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ERP 프론트의 public/soldier76/에 빌드 결과물을 넣어서 ERP 빌드 시 같이 배포되게 함.
const ERP_PUBLIC_DIR = resolve(__dirname, '../frontend/packages/erp/public/soldier76');

export default defineConfig({
  base: './', // 정적 자산 상대 경로 → /soldier76/ 하위에 서빙되어도 동작
  server: {
    port: 5174,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: ERP_PUBLIC_DIR,
    emptyOutDir: true,
  },
});
