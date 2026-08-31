#!/usr/bin/env bash
# DebateTimer — 宝塔生产部署
# 用法：
#   bash deploy/baota/deploy.sh
#   bash deploy/baota/deploy.sh --frontend-only
#   bash deploy/baota/deploy.sh --api-only
#   bash deploy/baota/deploy.sh --dry-run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DRY_RUN=0
TARGET_OVERRIDE=""

usage() {
    cat <<'EOF'
DebateTimer — 宝塔生产部署
用法：
  bash deploy/baota/deploy.sh
  bash deploy/baota/deploy.sh --api-only
  bash deploy/baota/deploy.sh --frontend-only
  bash deploy/baota/deploy.sh --dry-run

默认只部署 API（前端由 GitHub Pages 发布）。
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --frontend-only) TARGET_OVERRIDE=frontend ;;
        --api-only) TARGET_OVERRIDE=api ;;
        --help|-h) usage; exit 0 ;;
        *)
            echo "未知参数: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

if [[ -f "${SCRIPT_DIR}/deploy.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "${SCRIPT_DIR}/deploy.env"
    set +a
fi

APP_DIR="${APP_DIR:-$REPO_ROOT}"
GIT_BRANCH="${GIT_BRANCH:-deploy/production}"
SITE_DIR="${SITE_DIR:-/www/wwwroot/debatetimer.tonyxyz.com}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://api.debatetimer.tonyxyz.com}"
DEPLOY_TARGET="${TARGET_OVERRIDE:-${DEPLOY_TARGET:-api}}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
PM2_APP="${PM2_APP:-debatetimer-api}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-debatetimer-api}"
SITE_USER="${SITE_USER:-www}"
SITE_GROUP="${SITE_GROUP:-www}"
LOG_FILE="${LOG_FILE:-/www/wwwlogs/debatetimer-deploy.log}"

log() {
    local line="[$(date '+%F %T')] $*"
    echo "$line"
    if [[ "$DRY_RUN" -eq 0 ]]; then
        mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
        echo "$line" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

die() {
    log "错误: $*"
    exit 1
}

run() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN  $*"
        return 0
    fi
    log "+ $*"
    "$@"
}

need_frontend() {
    [[ "$DEPLOY_TARGET" == "both" || "$DEPLOY_TARGET" == "frontend" ]]
}

need_api() {
    [[ "$DEPLOY_TARGET" == "both" || "$DEPLOY_TARGET" == "api" ]]
}

find_in_path() {
    command -v "$1" 2>/dev/null || true
}

discover_node() {
    local candidate
    if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
        echo "$NODE_BIN"
        return
    fi
    candidate="$(find_in_path node)"
    if [[ -n "$candidate" ]]; then
        echo "$candidate"
        return
    fi
    local dir
    local dir
    for dir in /www/server/nodejs/*/bin; do
        if [[ -x "${dir}/node" ]]; then
            echo "${dir}/node"
            return
        fi
    done
    return 1
}

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

ensure_bun() {
    if [[ -n "$(find_in_path bun)" ]]; then
        find_in_path bun
        return
    fi
    if [[ -x "${HOME}/.bun/bin/bun" ]]; then
        echo "${HOME}/.bun/bin/bun"
        return
    fi
    log "未找到 bun，正在安装…"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo bun
        return
    fi
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="${HOME}/.bun"
    export PATH="${BUN_INSTALL}/bin:${PATH}"
    find_in_path bun || die "bun 安装失败"
}

export_node_path() {
    local node_bin="$1"
    local bindir
    bindir="$(dirname "$node_bin")"
    export PATH="${bindir}:${PATH}"
}

acquire_lock() {
    local lock_file="${APP_DIR}/.deploy.lock"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        return
    fi
    mkdir -p "$APP_DIR"
    exec 9>"$lock_file"
    if ! flock -n 9; then
        die "已有部署在进行（${lock_file}）。稍后再试。"
    fi
}

pull_repo() {
    [[ -d "${APP_DIR}/.git" ]] || die "${APP_DIR} 不是 git 仓库。先跑 setup.sh，或在该目录 git clone。"
    cd "$APP_DIR"
    log "仓库: ${APP_DIR}  分支: ${GIT_BRANCH}"
    run git fetch origin
    run git checkout "$GIT_BRANCH"
    run git pull --ff-only origin "$GIT_BRANCH"
    log "当前提交: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
}

install_api() {
    local bun node_bin
    bun="$(ensure_bun)"
    node_bin="$(discover_node)" || die "找不到 Node.js。请在宝塔「软件商店」安装 Node.js 版本管理器。"
    export_node_path "$node_bin"
    log "Node: $("$node_bin" -v)  ($node_bin)"
    [[ -f "${APP_DIR}/server/.env" ]] || {
        if [[ "$DRY_RUN" -eq 1 ]]; then
            log "DRY-RUN  将检查 ${APP_DIR}/server/.env"
        else
            die "缺少 ${APP_DIR}/server/.env 。请从 server/.env.example 复制并填写 MongoDB 与 ALLOWED_ORIGINS。"
        fi
    }
    cd "${APP_DIR}/server"
    if [[ -f bun.lock ]]; then
        run "$bun" install --frozen-lockfile
    else
        run "$bun" install
    fi
}

build_frontend() {
    local bun
    bun="$(ensure_bun)"
    cd "$APP_DIR"
    if [[ -f bun.lock ]]; then
        run "$bun" install --frozen-lockfile
    else
        run "$bun" install
    fi
    log "构建前端 VITE_API_BASE_URL=${VITE_API_BASE_URL}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN  VITE_API_BASE_URL=... bun run build"
        return
    fi
    VITE_API_BASE_URL="$VITE_API_BASE_URL" "$bun" run build
    [[ -f "${APP_DIR}/build/index.html" ]] || die "构建失败：没有 ${APP_DIR}/build/index.html"
}

publish_frontend() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN  rsync build/ -> ${SITE_DIR}"
        return
    fi
    command -v rsync >/dev/null || die "未找到 rsync。请先安装：yum install -y rsync  或  apt-get install -y rsync"
    [[ -d "$SITE_DIR" ]] || die "网站目录不存在: ${SITE_DIR}。请先在宝塔创建网站，或改 deploy.env 里的 SITE_DIR。"
    local staging
    staging="$(mktemp -d /tmp/debatetimer-frontend.XXXXXX)"
    rsync -a "${APP_DIR}/build/" "${staging}/"
    rsync -a --delete \
        --exclude '.user.ini' \
        --exclude '.htaccess' \
        --exclude '.well-known' \
        "${staging}/" "${SITE_DIR}/"
    rm -rf "$staging"
    if id "$SITE_USER" &>/dev/null; then
        chown -R "${SITE_USER}:${SITE_GROUP}" "$SITE_DIR"
    fi
    log "前端已发布到 ${SITE_DIR}"
}

restart_api() {
    local method=""
    local pm2_bin=""
    local baota_script=""

    choose_restart_method
    method="${CHOSEN_RESTART_METHOD:-}"
    baota_script="${CHOSEN_BAOTA_SCRIPT:-}"

    if [[ "$method" == "pm2" ]]; then
        if discover_pm2_match; then
            PM2_BIN="$MATCH_PM2_BIN"
            PM2_APP="$MATCH_PM2_NAME"
        fi
    elif [[ "$method" == "baota" && -z "$baota_script" ]]; then
        baota_script="$(find_baota_node_script || true)"
    fi

    case "$method" in
        command)
            run bash -lc "$RESTART_CMD"
            ;;
        pm2)
            pm2_bin="${PM2_BIN:-}"
            if [[ -z "$pm2_bin" ]]; then
                pm2_bin="$(list_pm2_bins | head -n1 || true)"
            fi
            [[ -n "$pm2_bin" && -x "$pm2_bin" ]] || die "找不到 pm2。可在 deploy.env 设置 PM2_BIN。"
            export_node_path "$pm2_bin"
            export APP_DIR PM2_APP
            log "重启 PM2 应用: ${PM2_APP}  (${pm2_bin})"
            if "$pm2_bin" describe "$PM2_APP" >/dev/null 2>&1; then
                run "$pm2_bin" restart "$PM2_APP" --update-env
            else
                log "该 pm2 中没有 ${PM2_APP}，先停占用端口的本仓库进程，再用 ecosystem 启动。"
                stop_app_listeners
                run "$pm2_bin" start "${SCRIPT_DIR}/ecosystem.config.cjs" --only "$PM2_APP"
            fi
            run "$pm2_bin" save || true
            ;;
        baota)
            if [[ -z "$baota_script" ]]; then
                baota_script="$(find_baota_node_script || true)"
            fi
            [[ -n "$baota_script" && -f "$baota_script" ]] || \
                die "找不到宝塔 Node 启动脚本（$(baota_scripts_dir)）。可在 deploy.env 设置 BAOTA_NODE_SCRIPT。"
            log "通过宝塔 Node 项目脚本重启: ${baota_script}"
            log "先停止占用端口 $(health_port) 且属于 ${APP_DIR} 的进程，避免脚本重复启动导致 EADDRINUSE。"
            stop_app_listeners
            run bash "$baota_script"
            ;;
        systemd)
            run systemctl restart "$SYSTEMD_UNIT"
            ;;
        *)
            log "未能自动重启 API：系统 pm2 list 为空，也没有匹配 ${APP_DIR} 的宝塔启动脚本或 systemd 单元。"
            dump_restart_hints
            log "也可在宝塔「网站 → Node 项目」里手动重启。"
            return 0
            ;;
    esac
}

wait_health() {
    local i
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN  curl ${HEALTH_URL}"
        return
    fi
    for i in $(seq 1 20); do
        if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
            log "API 健康检查通过: ${HEALTH_URL}"
            return
        fi
        sleep 1
    done
    die "API 启动后未能响应 ${HEALTH_URL}。看宝塔 Node 项目日志或 ${APP_DIR}/server 控制台输出。"
}

main() {
    log "======== DebateTimer 部署开始 target=${DEPLOY_TARGET} ========"
    acquire_lock
    pull_repo

    if need_api; then
        install_api
        restart_api
        wait_health
    fi

    if need_frontend; then
        build_frontend
        publish_frontend
    fi

    log "======== 部署完成 ========"
}

main
