// 应用迁移到 /app/ 子路径前的旧版 Service Worker 注册在根路径 /sw.js（scope=/）。
// 官网上线后，老访客的旧 SW 仍会用 precache 在根路径伺服旧应用壳。本文件占住
// /sw.js：旧注册的 update check 拿到新字节 → 安装激活 → 注销自身并清空全部
// 缓存，随后刷新受控页面，让根路径回落到官网本体。新应用的 SW 位于
// /app/sw.js（scope=/app/），与本文件互不相干。
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clientList = await self.clients.matchAll({ type: 'window' });
    clientList.forEach((client) => client.navigate(client.url));
  })());
});
