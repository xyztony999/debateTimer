#!/usr/bin/env bash
# 在宝塔服务器上做一次初始化：克隆仓库、准备 env。
# 前端仍由 GitHub Pages 发布；这里只准备 API。
# 用法（建议 root）：
#   bash deploy/baota/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${SCRIPT_DIR}/deploy.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "${SCRIPT_DIR}/deploy.env"
    set +a
fi

APP_DIR="${APP_DIR:-/www/wwwroot/debatetimer-api}"
GIT_BRANCH="${GIT_BRANCH:-deploy/production}"
REPO_URL="${REPO_URL:-https://github.com/xyztony999/debateTimer.git}"
PM2_APP="${PM2_APP:-debatetimer-api}"

log() { echo "[$(date '+%F %T')] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
    log "建议用 root 运行（宝塔 SSH 通常已是 root）。"
fi

mkdir -p "$(dirname "$APP_DIR")" /www/wwwlogs

if [[ ! -d "${APP_DIR}/.git" ]]; then
    log "克隆 ${REPO_URL} (${GIT_BRANCH}) -> ${APP_DIR}"
    git clone --branch "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
else
    log "仓库已存在: ${APP_DIR}"
fi

cd "$APP_DIR"

if [[ ! -f deploy/baota/deploy.env ]]; then
    cp deploy/baota/deploy.env.example deploy/baota/deploy.env
    log "已创建 deploy/baota/deploy.env ，请按机器改 APP_DIR。"
fi

if [[ ! -f server/.env ]]; then
    cp server/.env.example server/.env
    log "已创建 server/.env 。请填写 MongoDB 密码、ALLOWED_ORIGINS（GitHub Pages 域名），并取消注释 COOKIE_SECURE=true。"
fi

if command -v pm2 >/dev/null 2>&1 || ls /www/server/nodejs/v*/bin/pm2 >/dev/null 2>&1; then
    log "检测到 PM2。可以用下面命令登记 API（只需一次）："
    echo "  APP_DIR=${APP_DIR} pm2 start ${APP_DIR}/deploy/baota/ecosystem.config.cjs"
    echo "  pm2 save && pm2 startup"
fi

log "下一步："
echo "  1. 编辑 ${APP_DIR}/server/.env 和 ${APP_DIR}/deploy/baota/deploy.env"
echo "  2. 反代站点 /www/wwwroot/api.debatetimer.tonyxyz.com → 127.0.0.1:3001；Node 在 ${APP_DIR}/server"
echo "  3. bash ${APP_DIR}/deploy/baota/deploy.sh --api-only"
echo "  4. 打开 GitHub Pages 网站，注册第一个账号（自动成为管理员，并接管旧模板）"
