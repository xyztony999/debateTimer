# 在宝塔上部署 DebateTimer API

前端仍由 **GitHub Pages** 发布（推送 `deploy/production`，见 `.github/workflows/deploy.yml`）。  
宝塔只跑 **Node API + MongoDB**。脚本不会构建前端，也**不会**改 `server/.env` 或数据库里的数据。

| 位置 | 作用 |
|------|------|
| `debatetimer.tonyxyz.com` | 前端（GitHub Pages） |
| `/www/wwwroot/api.debatetimer.tonyxyz.com` | 宝塔反代站点（Nginx 指到 `127.0.0.1:3001`，不是 Node 源码） |
| `/www/wwwroot/debatetimer-api/server` | Node API 进程 |
| 宝塔 MongoDB | 用户、会话、模板 |

推送 `deploy/production` 时：Pages 发前端，GitHub Actions SSH（可选）在宝塔上跑 `deploy.sh --api-only`。

## 一次性准备

在宝塔里：

1. **软件商店**安装：Nginx、MongoDB、Node.js 版本管理器（18 或 20）、PM2。
2. **数据库 → MongoDB**：库名 `debatetimer`，给该库建用户，密码记下来。
3. **网站** `api.debatetimer.tonyxyz.com` 根目录为 `/www/wwwroot/api.debatetimer.tonyxyz.com`，开 SSL，反向代理到 `http://127.0.0.1:3001`（Node 在 `/www/wwwroot/debatetimer-api/server`）。把 [`nginx/api.snippet.conf`](nginx/api.snippet.conf) 贴进配置（登录 cookie 和 SSE 需要）。

当前 `/www/wwwroot/debatetimer-api` **只有 `server/`、不是 git 仓库**。第一次把完整仓库放进去（会备份旧目录和 `.env`）：

```bash
git clone -b deploy/production https://github.com/xyztony999/debateTimer.git /tmp/debatetimer-setup
bash /tmp/debatetimer-setup/deploy/baota/setup.sh
```

`setup.sh` 会：暂停 PM2（若有）→ 备份 `server/.env` → 把旧目录改名为 `debatetimer-api.bak-时间戳` → clone 整个仓库到 `/www/wwwroot/debatetimer-api` → 写回 `.env`。Node 路径仍是 `/www/wwwroot/debatetimer-api/server`，反代目录不用动。

若该路径已经是 git 仓库，改跟发版分支即可：

```bash
cd /www/wwwroot/debatetimer-api
git fetch origin
git checkout deploy/production
```

编辑：

- `/www/wwwroot/debatetimer-api/server/.env`
  - MongoDB 用户密码
  - `ALLOWED_ORIGINS=https://debatetimer.tonyxyz.com`（GitHub Pages 域名）
  - `COOKIE_SECURE=true`
- `/www/wwwroot/debatetimer-api/deploy/baota/deploy.env`
  - `APP_DIR=/www/wwwroot/debatetimer-api`、`GIT_BRANCH=deploy/production`、`DEPLOY_TARGET=api`

登记并启动 API：

```bash
cd /www/wwwroot/debatetimer-api
APP_DIR=/www/wwwroot/debatetimer-api pm2 start deploy/baota/ecosystem.config.cjs
pm2 save
pm2 startup
```

或用 systemd：见 `debatetimer-api.service`。

第一次发 API：

```bash
bash /www/wwwroot/debatetimer-api/deploy/baota/deploy.sh --api-only
```

打开 GitHub Pages 网站，**用你自己的用户名注册第一个账号**（自动成为管理员，旧模板会挂到这个账号下）。

## 以后怎么更新

推送 `deploy/production`：

1. GitHub Pages 自动更新前端。
2. 配好下面的 Actions 后，同一推送会 SSH 到宝塔只更新 API。

在服务器上手动：

```bash
bash /www/wwwroot/debatetimer-api/deploy/baota/deploy.sh --api-only
```

脚本会：切到 `deploy/production` → `git pull` → 安装 `server` 依赖 → 重启 API → 检查 `/health`。

### GitHub Actions SSH（推荐）

仓库 Settings → Secrets and variables → Actions：

| Secret | 含义 |
|--------|------|
| `BAOTA_SSH_HOST` | 服务器 IP 或域名 |
| `BAOTA_SSH_USER` | 一般是 `root` |
| `BAOTA_SSH_KEY` | 该用户的**私钥**全文 |
| `BAOTA_SSH_PORT` | 可选，默认 `22` |

Settings → Variables 增加 `BAOTA_DEPLOY=true`，否则 API 这条 workflow 不会跑。

服务器 `~/.ssh/authorized_keys` 放对应公钥。

### 宝塔计划任务（可选备份）

```bash
bash /www/wwwroot/debatetimer-api/deploy/baota/deploy.sh --api-only
```

### GitHub Webhook + PHP（可选）

`webhook.php` 默认只接受 `deploy/production` 的 push。PHP 用户必须能执行 `deploy.sh`；权限不够时用 Actions SSH。

## 检查

```bash
bash /www/wwwroot/debatetimer-api/deploy/baota/status.sh
curl -sS http://127.0.0.1:3001/health
```

日志：`/www/wwwlogs/debatetimer-deploy.log`。

## 注意

- 不要把 `server/.env`、`deploy/baota/deploy.env` 提交进 Git。
- `COOKIE_SECURE=true` 必须配 API 站点的 HTTPS。
- 前端构建里的 `VITE_API_BASE_URL` 由 GitHub Pages workflow 写成 `https://api.debatetimer.tonyxyz.com`。
- 若 API 起不来，先看 MongoDB 用户的 `authSource` 是 `debatetimer` 还是 `admin`。
