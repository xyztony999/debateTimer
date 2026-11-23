import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'https://api.debatetimer.tonyxyz.com';
  // 官网占域名根路径（仓库 site/ 目录），应用整体搬到 /app/ 子路径：Pages 构建
  // 注入 VITE_BASE=/app/（deploy.yml）；本地 dev / vite preview / selfhost 构建
  // 不注入，保持 '/' 行为不变。未知路径的 404 跳转由 site/404.html 在产物根负责。
  const rawBase = process.env.VITE_BASE || env.VITE_BASE || '/';
  const trimmedBase = rawBase.replace(/^\/+|\/+$/g, '');
  const BASE = trimmedBase ? `/${trimmedBase}/` : '/';

  return {
    plugins: [
      react(),
      svgr(),
      // PWA app-shell offline cache. API traffic is never cached (network-only)
      // so timer sync / template data never goes stale-offline.
      VitePWA({
        registerType: 'autoUpdate',
        // D25 (PageSpec §16): the app registers the SW itself (src/index.jsx)
        // to hook controllerchange — disable the plugin's auto-injection.
        injectRegister: null,
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          name: '辩论赛计时器 Debate Match Timer',
          short_name: 'Debate Timer',
          description: '按 UOMDC 规则制定的辩论赛计时器（模板/多屏同步/比赛记录）',
          start_url: BASE,
          display: 'standalone',
          theme_color: '#1a237e',
          background_color: '#ffffff',
          icons: [
            { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `${BASE}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: `${BASE}index.html`,
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    // 绝对 base 路径：/display/:token 不能用 ./assets（会请求 /display/assets 导致白屏）；
    // dev/preview/selfhost 默认 '/'，Pages 注入 '/app/'。
    base: BASE,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'build',
      rollupOptions: {
        output: {
          // Split the heavy vendors out of the app chunk so timer-page
          // updates don't re-download MUI & friends (better SW precache reuse).
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'mui-vendor': ['@mui/material', '@emotion/react', '@emotion/styled'],
            'i18n-vendor': ['i18next', 'react-i18next'],
          },
        },
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          // Browser → same-origin /api → remote (or local) API; avoids CORS.
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
