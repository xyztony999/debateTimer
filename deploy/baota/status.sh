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

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

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
echo "PM2 可执行文件："
if ! list_pm2_bins | grep -q .; then
    echo "  (未找到)"
fi
while IFS= read -r bin; do
    [[ -n "$bin" ]] || continue
    echo "---- ${bin} ----"
    "$bin" list 2>/dev/null || echo "  (list 失败)"
done < <(list_pm2_bins)

if discover_pm2_match; then
    echo
    echo "匹配到本仓库的 PM2 应用: ${MATCH_PM2_NAME} (${MATCH_PM2_BIN})"
else
    echo
    echo "各份 pm2 中都没有 cwd 属于 ${APP_DIR} 的应用（系统 pm2 list 为空时常见）。"
fi

echo
echo "宝塔 Node 启动脚本目录: $(baota_scripts_dir)"
if baota_script="$(find_baota_node_script)"; then
    echo "匹配到: ${baota_script}"
    echo "pid 文件: $(baota_pid_file "$baota_script")"
    if [[ -f "$(baota_pid_file "$baota_script")" ]]; then
        echo "  pid=$(tr -d '[:space:]' < "$(baota_pid_file "$baota_script")")"
    else
        echo "  (pid 文件不存在，进程可能没在跑或不是这份脚本起的)"
    fi
    echo "日志: $(baota_log_file "$baota_script")"
elif [[ -d "$(baota_scripts_dir)" ]]; then
    ls -1 "$(baota_scripts_dir)" || true
else
    echo "  (目录不存在)"
fi

echo
echo "端口 $(health_port) 监听："
if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | grep -E ":$(health_port)([^0-9]|$)" || echo "  (未看到监听)"
else
    echo "  (没有 ss 命令)"
fi
