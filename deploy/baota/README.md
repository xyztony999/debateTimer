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

若宝塔「网站 → Node 项目」里**已经在跑** API，不必再用下面的 `pm2 start` 登记一份，否则会和宝塔抢 3001 端口。`deploy.sh` 会自己找到宝塔那份进程并重启。

若你要自己用 PM2 托管，注意：系统里的 `/usr/bin/pm2` 经常 `pm2 list` 为空，真正管宝塔 Node 项目的是 `/www/server/nodejs/<版本>/bin/pm2`：

```bash
ls /www/server/nodejs/*/bin/pm2
/www/server/nodejs/<版本>/bin/pm2 list
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

## 两步验证的主密钥（`TOTP_SECRET_KEY`）

登录用的两步验证（验证器 App 里的动态口令）需要一个主密钥，用来加密保存每个账号的验证器密钥。**不配置时两步验证整体不生效**：启动日志里有一条报错，管理员账号的强制绑定暂不执行，后台页面顶部有一条提示。服务本身照常可用。

在服务器上生成一个，写进 `server/.env`（Base64，解码后必须正好 32 字节）：

```bash
cd /www/wwwroot/debatetimer-api/server
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
# 把输出写进 .env 的一行：TOTP_SECRET_KEY=<上面打印的那一串>
```

- 改完 `.env` 要重启 API 才生效：用下面「立刻手动重启」的命令，或等下一次 `deploy.sh` 发布。
- 生成后**离线另存一份**。这个值丢了，已绑定的账号就无法再通过两步验证，只能逐个重置。
- 它不进 Git、不进备份、不写进文档或工单。
- 服务器上 `node` 不在 PATH 时用完整路径：`/www/server/nodejs/v24.16.0/bin/node`。

### 有人丢了验证器

还有恢复码：在登录页选「使用恢复码」，每个只能用一次。

恢复码也用完了：管理员在后台用户表里点「重置两步验证」。若是管理员本人（后台不能重置自己），在服务器上执行：

```bash
cd /www/wwwroot/debatetimer-api/server
node scripts/reset-totp.js --username <用户名>
```

按提示再输入一遍用户名确认。该账号会在所有设备上下线，下次登录时重新绑定验证器。

### api 域名保持「仅 DNS」

审计日志记录的来源 IP，以及按 IP 的限流，都依赖请求直接到达这台服务器。`api.debatetimer.tonyxyz.com` 在 Cloudflare 里要保持灰云（仅 DNS）。如果改成橙云（代理），要同时在 Nginx 里配置 Cloudflare 的 realip，否则记录到的会是 Cloudflare 的地址。

## 检查

```bash
bash /www/wwwroot/debatetimer-api/deploy/baota/status.sh
curl -sS http://127.0.0.1:3001/health
```

日志：`/www/wwwlogs/debatetimer-deploy.log`。

### `pm2 list` 为空

生产上 **两份 pm2 都是空的**（`/usr/bin/pm2` 和 `/www/server/nodejs/v24.16.0/bin/pm2`）。宝塔「网站 → Node 项目」实际用的是：

| 路径 | 作用 |
|------|------|
| `/www/server/nodejs/vhost/scripts/debatetimer-api-server.sh` | 启动：`cd …/server && nohup npm run start` |
| `/www/server/nodejs/vhost/pids/debatetimer-api-server.pid` | npm 的 pid（`$!`，不是 node） |
| `/www/wwwlogs/nodejs/debatetimer-api-server.log` | 标准输出 |

不要再跑一遍启动脚本而不先停进程，会 `EADDRINUSE`。`deploy.sh` 会先按 pid 文件杀掉 npm 及其子进程（node），再停掉仍占 3001 的本仓库进程，然后执行该脚本。

立刻手动重启：

```bash
pidfile=/www/server/nodejs/vhost/pids/debatetimer-api-server.pid
[[ -f $pidfile ]] && kill "$(cat $pidfile)" || true
ss -lntp | grep 3001   # 若 node 还在，再 kill 那个 pid
bash /www/server/nodejs/vhost/scripts/debatetimer-api-server.sh
curl -sS http://127.0.0.1:3001/health
```

## 注意

- 不要把 `server/.env`、`deploy/baota/deploy.env` 提交进 Git。
- `COOKIE_SECURE=true` 必须配 API 站点的 HTTPS。
- 前端构建里的 `VITE_API_BASE_URL` 由 GitHub Pages workflow 写成 `https://api.debatetimer.tonyxyz.com`。
- 若 API 起不来，先看 MongoDB 用户的 `authSource` 是 `debatetimer` 还是 `admin`。
