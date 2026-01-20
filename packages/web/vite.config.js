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
                // Configure proxy to handle SSE properly (no buffering)
                configure: function (proxy) {
                    proxy.on('proxyRes', function (proxyRes) {
                        var _a;
                        // Disable buffering for SSE responses
                        if ((_a = proxyRes.headers['content-type']) === null || _a === void 0 ? void 0 : _a.includes('text/event-stream')) {
                            proxyRes.headers['cache-control'] = 'no-cache';
                            proxyRes.headers['connection'] = 'keep-alive';
                        }
                    });
                },
            },
        },
    },
});
