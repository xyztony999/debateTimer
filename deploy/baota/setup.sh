#!/usr/bin/env bash
# 在宝塔服务器上做一次初始化：把完整 git 仓库放到 APP_DIR。
# 若 /www/wwwroot/debatetimer-api 里目前只有 server/、不是 git 仓库，
# 会先备份 server/.env，把旧目录挪走，再 clone 整个仓库并恢复 .env。
#
# 目录里还没有本仓库时，先 clone 到临时目录再跑：
#   git clone -b deploy/production https://github.com/xyztony999/debateTimer.git /tmp/debatetimer-setup
#   bash /tmp/debatetimer-setup/deploy/baota/setup.sh
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
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"

log() { echo "[$(date '+%F %T')] $*"; }

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

die() {
    echo "错误: $*" >&2
    exit 1
}

dir_is_empty() {
    local d="$1"
    [[ -d "$d" ]] || return 0
    [[ -z "$(ls -A "$d" 2>/dev/null)" ]]
}

stop_api_if_running() {
    if discover_pm2_match; then
        log "暂停 PM2 应用 ${MATCH_PM2_NAME}（${MATCH_PM2_BIN}），避免挪目录时文件被占用"
        "$MATCH_PM2_BIN" stop "$MATCH_PM2_NAME" || true
    fi
    stop_app_listeners
}

restore_env_from() {
    local src="$1"
    mkdir -p "${APP_DIR}/server"
    if [[ -f "$src" ]]; then
        cp -a "$src" "${APP_DIR}/server/.env"
        log "已恢复 server/.env"
        return 0
    fi
    return 1
}

ensure_git_clone() {
    mkdir -p "$(dirname "$APP_DIR")" /www/wwwlogs

    if [[ -d "${APP_DIR}/.git" ]]; then
        log "仓库已存在: ${APP_DIR}"
        return
    fi

    local script_root
    script_root="$(cd "${SCRIPT_DIR}/../.." && pwd)"
    if [[ -d "$APP_DIR" ]]; then
        local app_real
        app_real="$(cd "$APP_DIR" && pwd)"
        if [[ "$app_real" == "$script_root" ]]; then
            die "当前目录 ${APP_DIR} 还不是 git 仓库。请改用：
  git clone -b ${GIT_BRANCH} ${REPO_URL} /tmp/debatetimer-setup
  bash /tmp/debatetimer-setup/deploy/baota/setup.sh"
        fi
    fi

    if [[ ! -e "$APP_DIR" ]] || dir_is_empty "$APP_DIR"; then
        log "克隆 ${REPO_URL} (${GIT_BRANCH}) -> ${APP_DIR}"
        git clone --branch "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
        return
    fi

    log "${APP_DIR} 已有文件但不是 git 仓库（例如只有 server/）。将备份后 clone 完整仓库。"
    stop_api_if_running

    local env_backup=""
    if [[ -f "${APP_DIR}/server/.env" ]]; then
        env_backup="/tmp/debatetimer-server.env.$$"
        cp -a "${APP_DIR}/server/.env" "$env_backup"
        log "已备份 ${APP_DIR}/server/.env -> ${env_backup}"
    elif [[ -f "${APP_DIR}/.env" ]]; then
        env_backup="/tmp/debatetimer-server.env.$$"
        cp -a "${APP_DIR}/.env" "$env_backup"
        log "已备份 ${APP_DIR}/.env -> ${env_backup}"
    fi

    local backup="${APP_DIR}.bak-$(date +%Y%m%d%H%M%S)"
    mv "$APP_DIR" "$backup"
    log "旧目录已挪到 ${backup}"

    git clone --branch "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"

    if [[ -n "$env_backup" ]]; then
        restore_env_from "$env_backup" || true
        rm -f "$env_backup"
    elif [[ -f "${backup}/server/.env" ]]; then
        restore_env_from "${backup}/server/.env" || true
    elif [[ -f "${backup}/.env" ]]; then
        restore_env_from "${backup}/.env" || true
    fi
}

if [[ "$(id -u)" -ne 0 ]]; then
    log "建议用 root 运行（宝塔 SSH 通常已是 root）。"
fi

ensure_git_clone
cd "$APP_DIR"
[[ -d .git ]] || die "${APP_DIR} 仍然不是 git 仓库"

if [[ ! -f deploy/baota/deploy.env ]]; then
    cp deploy/baota/deploy.env.example deploy/baota/deploy.env
    log "已创建 deploy/baota/deploy.env"
fi

if [[ ! -f server/.env ]]; then
    cp server/.env.example server/.env
    log "已创建 server/.env 。请填写 MongoDB 密码、ALLOWED_ORIGINS（GitHub Pages 域名），并取消注释 COOKIE_SECURE=true。"
else
    log "保留已有 server/.env"
fi

if list_pm2_bins | grep -q .; then
    log "检测到 PM2。若宝塔「网站 → Node 项目」里已经在跑 API，不必再登记；deploy.sh 会按目录匹配重启。"
    log "若要用本仓库的 ecosystem 自行托管，注意用有进程的那份 pm2（系统 /usr/bin/pm2 的 list 经常是空的）："
    list_pm2_bins | while IFS= read -r bin; do
        echo "  APP_DIR=${APP_DIR} ${bin} start ${APP_DIR}/deploy/baota/ecosystem.config.cjs"
    done
fi

log "下一步："
echo "  1. 核对 ${APP_DIR}/server/.env 和 ${APP_DIR}/deploy/baota/deploy.env"
echo "  2. 反代站点 /www/wwwroot/api.debatetimer.tonyxyz.com → 127.0.0.1:3001；Node 在 ${APP_DIR}/server"
echo "  3. bash ${APP_DIR}/deploy/baota/deploy.sh --api-only"
echo "  4. 打开 GitHub Pages 网站，注册第一个账号（自动成为管理员，并接管旧模板）"
