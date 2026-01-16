import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);
var API_PORT = process.env.PORT || '3001';
export default defineConfig({
    plugins: [react()],
    server: {
        port: WEB_PORT,
        proxy: {
            '/api': {
                target: "http://localhost:".concat(API_PORT),
                changeOrigin: true,
            },
        },
    },
});
