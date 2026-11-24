import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // FastAPI 개발 서버(팀 공용 서버). 백엔드 경로가 /api/v1/... 이므로 경로를 그대로 넘긴다 (VITE_API_BASE_URL 미설정 시)
      '/api': {
        target: 'http://101.79.27.212:8000',
        changeOrigin: true,
      },
    },
  },
});
