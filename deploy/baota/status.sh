#!/usr/bin/env bash
# 查看宝塔上 DebateTimer API 的部署状态。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/deploy.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "${SCRIPT_DIR}/deploy.env"
    set +a
fi

APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
PM2_APP="${PM2_APP:-debatetimer-api}"

echo "仓库: $APP_DIR"
if [[ -d "${APP_DIR}/.git" ]]; then
    git -C "$APP_DIR" status -sb
    git -C "$APP_DIR" log -1 --oneline
else
    echo "  (不是 git 仓库)"
fi

echo
echo "API ${HEALTH_URL}"
if curl -fsS "$HEALTH_URL"; then
    echo
else
    echo "  无响应"
fi

echo
if command -v pm2 >/dev/null 2>&1; then
    pm2 describe "$PM2_APP" 2>/dev/null | head -40 || echo "PM2 中没有 ${PM2_APP}"
fi
