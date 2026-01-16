import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);
const API_PORT = process.env.PORT || '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
