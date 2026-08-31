import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
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
    plugins: [react(), svgr(), spaFallback404('build')],
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
