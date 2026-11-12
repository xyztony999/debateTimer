# 自部署（Self-hosting）

在自己服务器上跑一套完整的 DebateTimer：前端页面 + API + MongoDB。
不需要 GitHub Pages，也不需要宝塔面板——任意 Linux 服务器（Ubuntu/Debian/CentOS）均可。

## 两种拓扑

| | 拓扑 1：全栈一体化（推荐起步） | 拓扑 2：Nginx 静态 + API 反代 |
|---|---|---|
| 形态 | 一个 Node 进程同时提供页面与 API | Nginx 托管 `build/` 静态文件，`/api` 反代 Node |
| 域名 | 一个（如 `http://IP:3001`） | 页面域名 + API 域名（或同域名路径分流） |
| 依赖 | Node ≥ 20 + MongoDB（+ git） | 另需 Nginx |
| 适用 | 内网、快速起步、小规模自用 | 已有 Nginx/HTTPS、前端要独立扩缩的场景 |

拓扑 1 中前端与 API 同源，天然没有 CORS 与跨站 cookie 问题；
拓扑 2 需要把页面域名加进 `server/.env` 的 `ALLOWED_ORIGINS`。

## 拓扑 1：一键安装

```bash
# MongoDB 尚未安装？Docker 一行起步（已有实例可跳过）：
docker run -d --name dt-mongo -p 27017:27017 mongo:7

curl -fsSL https://raw.githubusercontent.com/xyztony999/debateTimer/master/deploy/selfhost/setup.sh -o /tmp/dt-setup.sh
bash /tmp/dt-setup.sh            # 默认装到 /opt/debatetimer，监听 0.0.0.0:3001
```

脚本会：克隆仓库 → 生成 `server/.env` → 构建前端 → 安装依赖 →
启动（自动选择 systemd / pm2 / nohup）→ 探活 `/health`。

成功后访问 `http://<服务器IP>:3001/`，注册的第一个账号自动成为管理员。

自定义安装位置/端口/分支：

```bash
APP_DIR=/srv/dt PORT=8080 GIT_BRANCH=master bash /tmp/dt-setup.sh
```

### 升级

重跑一次安装脚本即可（幂等：`git pull` → 重新构建 → 重启；不会覆盖已有的 `server/.env`）：

```bash
bash /opt/debatetimer/deploy/selfhost/setup.sh
```

## 拓扑 2：Nginx 静态 + API 反代

1. 先按拓扑 1 跑起来（或至少完成构建），但把 `server/.env` 里的
   `HOST` 保持默认 `127.0.0.1`（不直接对外），删掉 `STATIC_DIR`。
2. Nginx 页面站点直接引用现成配置片段 [`deploy/baota/nginx/frontend.snippet.conf`](../baota/nginx/frontend.snippet.conf)
   （`root` 指向仓库 `build/`，SPA 回退 `try_files ... /index.html`）。
3. API 站点反代 `127.0.0.1:3001`，参考 [`deploy/baota/nginx/api.snippet.conf`](../baota/nginx/api.snippet.conf)
   （注意 SSE 需要 `proxy_buffering off`，该片段已含）。
4. `ALLOWED_ORIGINS` 加上页面域名，如 `https://dt.example.com`。

## HTTPS / 登录 cookie

- 默认（HTTP 起步）登录 cookie 不带 `Secure`，直接可用。
- 套上 HTTPS 反代（Nginx + 证书）后，在 `server/.env` 打开
  `COOKIE_SECURE=true` 再重启。
- 反过来注意：**HTTPS 生产环境不要保持无 `COOKIE_SECURE`**；而
  纯 HTTP 环境绝不能开它（浏览器会拒收 cookie，表现为"登录成功但刷新就掉线"）。
- 若沿用 `deploy/baota/debatetimer-api.service`（内含
  `NODE_ENV=production`），纯 HTTP 下必须显式 `COOKIE_SECURE=false`。

## 常见问题

| 症状 | 原因与处理 |
|---|---|
| 启动报 MongoDB 连接失败 | `server/.env` 的 `MONGODB_*` 与实际实例不符；有认证时改用完整 `MONGODB_URI`（密码含特殊字符要 URL 编码） |
| 登录成功但刷新掉线 | HTTP 下开了 `COOKIE_SECURE`，或 HTTPS 下没开（见上一节） |
| 访问页面 404 / 白屏 | `build/` 不存在（先完成构建）；或 `STATIC_DIR` 路径相对 `server/` 工作目录解析不对（默认 `../build`） |
| 端口被占用 | 改 `PORT` 后重启；`ss -ltnp \| grep 3001` 查占用 |
| 想换绑到仅本机 | `HOST=127.0.0.1`，由 Nginx 反代对外 |

## 数据与备份

- 全部业务数据在 MongoDB（默认库名 `debatetimer`）。
- 备份/恢复工具：`server/scripts/backup.js`（NDJSON 导出/导入），示例见根
  [README.md](../../README.md) 的备份一节。

## 与宝塔部署（deploy/baota/）的关系

`deploy/baota/` 面向作者的宝塔生产环境（GitHub Actions SSH 自动部署）；
本目录面向社区自部署，两者共用同一套 server 代码与 systemd/PM2 配置模板。
