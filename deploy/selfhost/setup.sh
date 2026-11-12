#!/usr/bin/env bash
# DebateTimer 社区自部署一条龙（全栈一体化：一个 Node 进程同时提供前端页面与 API）。
#
# 全新安装（任意 Linux，建议 root）：
#   curl -fsSL https://raw.githubusercontent.com/xyztony999/debateTimer/master/deploy/selfhost/setup.sh -o /tmp/dt-setup.sh
#   bash /tmp/dt-setup.sh [目标目录]
# 在本仓库内升级重跑即可（幂等：git pull -> 重新构建 -> 重启）：
#   bash deploy/selfhost/setup.sh [目标目录]
#
# 可用环境变量覆盖默认值（见 deploy/selfhost/README.md）：
#   APP_DIR  安装目录（默认 /opt/debatetimer）
#   GIT_BRANCH  跟踪分支（默认 master）
#   PORT / HOST / MONGODB_URI / REPO_URL
set -euo pipefail

APP_DIR="${1:-${APP_DIR:-/opt/debatetimer}}"
GIT_BRANCH="${GIT_BRANCH:-master}"
REPO_URL="${REPO_URL:-https://github.com/xyztony999/debateTimer.git}"
PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

log() { echo "[$(date '+%F %T')] $*"; }
die() { echo "错误: $*" >&2; exit 1; }

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "缺少命令 $1（$2）"
}

# ---------- 1. 依赖检测 ----------
need_cmd git "安装: apt install -y git"
need_cmd node "安装 Node.js >= 20（如 apt install -y nodejs 或 https://github.com/nvm-sh/nvm）"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "${NODE_MAJOR}" -ge 20 ]] || die "需要 Node.js >= 20，当前 $(node -v)"

if [[ -z "${MONGODB_URI:-}" ]] && ! (echo > /dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
    log "警告: 本机 27017 不通。请先安装/启动 MongoDB，或设 MONGODB_URI 指向远程实例后再重跑。"
    log "        （Docker 快速起一个: docker run -d --name dt-mongo -p 27017:27017 mongo:7）"
fi

# ---------- 2. 拉取代码 ----------
if [[ -d "${APP_DIR}/.git" ]]; then
    log "更新已有仓库 ${APP_DIR}（${GIT_BRANCH}）"
    git -C "${APP_DIR}" fetch origin
    git -C "${APP_DIR}" checkout "${GIT_BRANCH}"
    git -C "${APP_DIR}" pull --ff-only origin "${GIT_BRANCH}"
else
    log "克隆 ${REPO_URL}（${GIT_BRANCH}）-> ${APP_DIR}"
    mkdir -p "$(dirname "${APP_DIR}")"
    git clone --branch "${GIT_BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi
cd "${APP_DIR}"

# ---------- 3. 生成 server/.env（仅首次） ----------
if [[ ! -f server/.env ]]; then
    log "生成 server/.env（一体化默认值；之后可手动编辑，重跑不会被覆盖）"
    cat > server/.env <<ENV
PORT=${PORT}
HOST=${HOST}
STATIC_DIR=../build

# MongoDB：本机无认证实例可直接用默认；有认证/远程实例请改成完整 URI，例如
# MONGODB_URI=mongodb://debatetimer:YOUR_PASSWORD@127.0.0.1:27017/debatetimer?authSource=debatetimer
MONGODB_HOST=127.0.0.1
MONGODB_PORT=27017
MONGODB_DB=debatetimer

# 一体化同源部署无需跨域白名单；若另配独立前端域名，把该域名加进来（逗号分隔）
ALLOWED_ORIGINS=http://localhost:${PORT}

# HTTPS 反代上线后取消注释：
# COOKIE_SECURE=true
ENV
else
    log "保留已有 server/.env"
fi

# ---------- 4. 构建 ----------
if command -v bun >/dev/null 2>&1; then
    log "构建前端（bun）"
    bun install --frozen-lockfile
    bun run build
    log "安装 server 依赖（bun）"
    ( cd server && bun install --production )
else
    need_cmd npm "随 Node.js 附带；或安装 bun 后重试"
    log "构建前端（npm）"
    npm install --no-audit --no-fund
    npm run build
    log "安装 server 依赖（npm）"
    ( cd server && npm install --omit=dev --no-audit --no-fund )
fi

# ---------- 5. 启动/重启 ----------
SERVICE_NAME="debatetimer"
PID_FILE="${APP_DIR}/dt.pid"

stop_existing() {
    if [[ -f "${PID_FILE}" ]]; then
        local pid
        pid="$(cat "${PID_FILE}")"
        if kill -0 "${pid}" 2>/dev/null; then
            log "停止旧进程 (pid ${pid})"
            kill "${pid}" || true
            for _ in $(seq 1 10); do kill -0 "${pid}" 2>/dev/null || break; sleep 1; done
        fi
        rm -f "${PID_FILE}"
    fi
}

start_systemd() {
    log "使用 systemd 启动"
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=DebateTimer (all-stack self-hosted)
After=network.target mongod.service docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/server
EnvironmentFile=-${APP_DIR}/server/.env
ExecStart=/usr/bin/env node index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now "${SERVICE_NAME}" >/dev/null
    systemctl restart "${SERVICE_NAME}"
}

start_pm2() {
    log "使用 pm2 启动"
    ( cd server && APP_DIR="${APP_DIR}" PM2_APP="${SERVICE_NAME}" pm2 start "${APP_DIR}/deploy/baota/ecosystem.config.cjs" && pm2 save )
}

start_nohup() {
    log "使用 nohup 启动（日志: ${APP_DIR}/dt-api.log）"
    stop_existing
    ( cd server && nohup node index.js >> "${APP_DIR}/dt-api.log" 2>&1 & echo $! > "${PID_FILE}" )
}

if [[ "$(id -u)" -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then
    start_systemd
elif command -v pm2 >/dev/null 2>&1; then
    start_pm2
else
    start_nohup
fi

# ---------- 6. 探活 ----------
log "等待 ${HEALTH_URL}"
ok=0
for _ in $(seq 1 20); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
done
if [[ "${ok}" -ne 1 ]]; then
    echo "探活失败。排查："
    echo "  - journalctl -u ${SERVICE_NAME} -n 50 --no-pager   # systemd"
    echo "  - pm2 logs ${SERVICE_NAME} --lines 50             # pm2"
    echo "  - tail -50 ${APP_DIR}/dt-api.log                  # nohup"
    echo "  - MongoDB 是否可达（server/.env 的 MONGODB_*）"
    exit 1
fi

echo
log "完成。访问 http://<服务器IP>:${PORT}/ 注册第一个账号（自动成为管理员）。"
log "配置文件: ${APP_DIR}/server/.env（改后重启）。升级: 重新运行本脚本。手册: deploy/selfhost/README.md"
