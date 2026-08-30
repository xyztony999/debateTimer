# 在宝塔面板上部署 DebateTimer

前端静态站 + Node API + MongoDB。脚本只改服务器上的代码和构建产物，**不会**动 `server/.env` 里的密码。

| 域名 | 作用 |
|------|------|
| `debatetimer.tonyxyz.com` | 前端（Nginx 静态，SPA） |
| `api.debatetimer.tonyxyz.com` | API（Nginx 反代 `127.0.0.1:3001`） |

GitHub Pages 那套（`deploy/production`）可以继续留着；转到宝塔后把 DNS 指到这台机器即可。

## 一次性准备

在宝塔里：

1. **软件商店**安装：Nginx、MongoDB、Node.js 版本管理器（18 或 20）、PM2（Node 项目会自带）。
2. **数据库 → MongoDB**：库名 `debatetimer`，给该库建用户，密码记下来。
3. **网站**建两个站点，都开 SSL（Let's Encrypt）：
   - `debatetimer.tonyxyz.com`，根目录例如 `/www/wwwroot/debatetimer.tonyxyz.com`
   - `api.debatetimer.tonyxyz.com`，类型选反向代理，目标 `http://127.0.0.1:3001`，再把 [`nginx/api.snippet.conf`](nginx/api.snippet.conf) 贴进配置（SSE 需要关掉缓冲）。
4. 前端站点配置贴上 [`nginx/frontend.snippet.conf`](nginx/frontend.snippet.conf)，然后 `nginx -t` 并重载。

SSH 登录服务器（root）：

```bash
git clone -b master https://github.com/xyztony999/debateTimer.git /www/wwwroot/debatetimer
bash /www/wwwroot/debatetimer/deploy/baota/setup.sh
```

编辑两个文件：

- ` /www/wwwroot/debatetimer/server/.env`
  - MongoDB 用户密码
  - `ALLOWED_ORIGINS=https://debatetimer.tonyxyz.com`
  - `COOKIE_SECURE=true`
- `/www/wwwroot/debatetimer/deploy/baota/deploy.env`
  - `APP_DIR`、`SITE_DIR`、`VITE_API_BASE_URL` 按实际路径改

登记并启动 API（三选一）：

```bash
# A. 宝塔 Node 项目 / PM2（推荐）
cd /www/wwwroot/debatetimer
APP_DIR=/www/wwwroot/debatetimer pm2 start deploy/baota/ecosystem.config.cjs
pm2 save
pm2 startup

# B. systemd
cp /www/wwwroot/debatetimer/deploy/baota/debatetimer-api.service /etc/systemd/system/
# 若 node 不在 PATH 里，改 ExecStart 为宝塔 Node 绝对路径
systemctl daemon-reload && systemctl enable --now debatetimer-api
```

第一次发版：

```bash
bash /www/wwwroot/debatetimer/deploy/baota/deploy.sh
```

打开网站，**用你自己的用户名注册第一个账号**（自动成为管理员，旧模板会挂到这个账号下）。

## 以后怎么更新

在服务器上：

```bash
bash /www/wwwroot/debatetimer/deploy/baota/deploy.sh
# 只更 API
bash /www/wwwroot/debatetimer/deploy/baota/deploy.sh --api-only
# 只更前端
bash /www/wwwroot/debatetimer/deploy/baota/deploy.sh --frontend-only
```

脚本会：`git pull` → 装依赖 → 重启 API 并打 `/health` → `bun run build` → 同步到网站目录（保留 `.user.ini` / `.well-known`）。

### 方式 1：宝塔计划任务（最省事）

计划任务 → Shell 脚本 → 每天或每小时：

```bash
bash /www/wwwroot/debatetimer/deploy/baota/deploy.sh
```

不需要公开 webhook。想推完代码马上更新，用下面两种。

### 方式 2：GitHub Actions SSH（推荐自动）

仓库 Settings → Secrets and variables → Actions，添加：

| Secret | 含义 |
|--------|------|
| `BAOTA_SSH_HOST` | 服务器 IP 或域名 |
| `BAOTA_SSH_USER` | 一般是 `root` |
| `BAOTA_SSH_KEY` | 该用户的**私钥**全文 |
| `BAOTA_SSH_PORT` | 可选，默认 `22` |

再在 Settings → Variables 增加 `BAOTA_DEPLOY=true`，否则 workflow 不会跑（避免没配密钥时红掉）。

`master` 有推送，或 Actions 里手动 Run workflow，就会 SSH 上去跑 `deploy.sh`。

服务器上要先放好对应公钥：`~/.ssh/authorized_keys`。

### 方式 3：GitHub Webhook + PHP

把 `webhook.php` 放到**不是前端根目录**的地方，`deploy.env` 增加 `WEBHOOK_SECRET=长随机串`。GitHub Webhook 的 Secret 填同一串。PHP 用户必须能执行 `deploy.sh`（权限不够时请用方式 2）。

## 检查

```bash
bash /www/wwwroot/debatetimer/deploy/baota/status.sh
curl -sS http://127.0.0.1:3001/health
```

日志：`/www/wwwlogs/debatetimer-deploy.log`，以及宝塔 Node 项目日志。

## 注意

- 不要把 `server/.env`、`deploy/baota/deploy.env` 提交进 Git。
- `COOKIE_SECURE=true` 必须配 HTTPS，否则登录 cookie 种不上。
- 前端构建里的 `VITE_API_BASE_URL` 要和浏览器实际访问的 API 域名一致。
- 若 API 起不来，先看 MongoDB 用户的 `authSource` 是 `debatetimer` 还是 `admin`。
