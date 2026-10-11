import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { copyFileSync, existsSync } from 'fs';

/** GitHub Pages 对未知路径返回 404.html；复制 index 以便 /display/:token 也能加载 SPA。 */
function spaFallback404(outDir) {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const index = path.resolve(outDir, 'index.html');
      const fallback = path.resolve(outDir, '404.html');
      if (existsSync(index)) {
        copyFileSync(index, fallback);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'https://api.debatetimer.tonyxyz.com';

  return {
    plugins: [
      react(),
      svgr(),
      spaFallback404('build'),
      // PWA app-shell offline cache. API traffic is never cached (network-only)
      // so timer sync / template data never goes stale-offline.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          name: '辩论赛计时器 Debate Match Timer',
          short_name: 'Debate Timer',
          description: '按 UOMDC 规则制定的辩论赛计时器（模板/多屏同步/比赛记录）',
          start_url: '/',
          display: 'standalone',
          theme_color: '#1a237e',
          background_color: '#ffffff',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    // 绝对根路径：/display/:token 不能用 ./assets（会请求 /display/assets 导致白屏）
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'build',
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
