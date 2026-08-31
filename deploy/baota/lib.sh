#!/usr/bin/env bash
# 宝塔部署脚本共用函数。由 deploy.sh / setup.sh / status.sh source，不要直接执行。

baota_nodejs_root() {
    echo "${BAOTA_NODEJS_ROOT:-/www/server/nodejs}"
}

baota_scripts_dir() {
    echo "${BAOTA_NODE_SCRIPTS_DIR:-/www/server/nodejs/vhost/scripts}"
}

health_port() {
    local url="${HEALTH_URL:-http://127.0.0.1:3001/health}"
    if [[ "$url" =~ :([0-9]+)(/|$) ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi
    echo 3001
}

# 列出所有可能的 pm2：显式 PM2_BIN、PATH 上的、以及宝塔各 Node 版本目录。
# /usr/bin/pm2 经常是空的；真正管宝塔 Node 项目的是 /www/server/nodejs/<版本>/bin/pm2。
list_pm2_bins() {
    {
        if [[ -n "${PM2_BIN:-}" && -x "${PM2_BIN}" ]]; then
            printf '%s\n' "$PM2_BIN"
        fi
        local c
        c="$(command -v pm2 2>/dev/null || true)"
        if [[ -n "$c" && -x "$c" ]]; then
            printf '%s\n' "$c"
        fi
        local f root
        root="$(baota_nodejs_root)"
        for f in "${root}"/*/bin/pm2; do
            if [[ -x "$f" ]]; then
                printf '%s\n' "$f"
            fi
        done
    } | awk 'NF && !seen[$0]++'
}

# 在一份 pm2 里找属于 APP_DIR 的应用名。找不到则返回 1。
discover_pm2_app() {
    local pm2_bin="$1"
    local app=""
    local names=""

    if [[ -n "${PM2_APP:-}" ]] && "$pm2_bin" describe "$PM2_APP" >/dev/null 2>&1; then
        echo "$PM2_APP"
        return
    fi

    for names in "${PM2_APP:-}" debatetimer-api server index "$(basename "${APP_DIR:-.}")"; do
        [[ -n "$names" ]] || continue
        if "$pm2_bin" describe "$names" >/dev/null 2>&1; then
            echo "$names"
            return
        fi
    done

    command -v python3 >/dev/null 2>&1 || return 1
    app="$(
        "$pm2_bin" jlist 2>/dev/null | python3 -c '
import json, os, sys
want = os.path.realpath(sys.argv[1])
try:
    apps = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if not isinstance(apps, list):
    sys.exit(1)
for item in apps:
    env = item.get("pm2_env") or {}
    cwd = env.get("pm_cwd") or item.get("cwd") or ""
    if not cwd:
        continue
    cwd = os.path.realpath(cwd)
    if cwd == want or cwd == os.path.join(want, "server") or cwd.startswith(want + os.sep):
        name = item.get("name") or env.get("name")
        if name:
            print(name)
            sys.exit(0)
sys.exit(1)
' "${APP_DIR}" 2>/dev/null
    )" || true
    if [[ -n "$app" ]]; then
        echo "$app"
        return
    fi
    return 1
}

# 扫所有 pm2，找到第一份真正管着本仓库的。成功时设置 MATCH_PM2_BIN / MATCH_PM2_NAME。
discover_pm2_match() {
    MATCH_PM2_BIN=""
    MATCH_PM2_NAME=""
    local bin name
    while IFS= read -r bin; do
        [[ -n "$bin" ]] || continue
        if name="$(discover_pm2_app "$bin")"; then
            MATCH_PM2_BIN="$bin"
            MATCH_PM2_NAME="$name"
            return 0
        fi
    done < <(list_pm2_bins)
    return 1
}

# 宝塔「网站 → Node 项目」生成的启动脚本，里面通常写了项目绝对路径。
find_baota_node_script() {
    if [[ -n "${BAOTA_NODE_SCRIPT:-}" && -f "${BAOTA_NODE_SCRIPT}" ]]; then
        echo "$BAOTA_NODE_SCRIPT"
        return 0
    fi
    local dir want f name
    dir="$(baota_scripts_dir)"
    [[ -d "$dir" ]] || return 1
    want="$(readlink -f "${APP_DIR}" 2>/dev/null || echo "${APP_DIR}")"
    for f in "$dir"/*.sh; do
        [[ -f "$f" ]] || continue
        if grep -qF "$want" "$f" 2>/dev/null || grep -qF "${APP_DIR}" "$f" 2>/dev/null; then
            echo "$f"
            return 0
        fi
    done
    for name in debatetimer-api "$(basename "${APP_DIR}")"; do
        [[ -n "$name" ]] || continue
        if [[ -f "${dir}/${name}.sh" ]]; then
            echo "${dir}/${name}.sh"
            return 0
        fi
    done
    return 1
}

# 选出重启方式：command / pm2 / baota / systemd，或空字符串。
# 成功匹配 pm2 时设置 MATCH_PM2_BIN / MATCH_PM2_NAME；匹配脚本时设置 CHOSEN_BAOTA_SCRIPT。
choose_restart_method() {
    CHOSEN_RESTART_METHOD="${RESTART_WITH:-}"
    CHOSEN_BAOTA_SCRIPT=""
    if [[ -n "${RESTART_CMD:-}" ]]; then
        CHOSEN_RESTART_METHOD="command"
        return
    fi
    if [[ -z "$CHOSEN_RESTART_METHOD" ]]; then
        if discover_pm2_match; then
            CHOSEN_RESTART_METHOD="pm2"
            return
        fi
        if CHOSEN_BAOTA_SCRIPT="$(find_baota_node_script)"; then
            CHOSEN_RESTART_METHOD="baota"
            return
        fi
        if command -v systemctl >/dev/null 2>&1 && \
            systemctl list-unit-files "${SYSTEMD_UNIT:-debatetimer-api}.service" >/dev/null 2>&1; then
            CHOSEN_RESTART_METHOD="systemd"
        fi
    fi
}

process_belongs_to_app() {
    local pid="$1"
    local want cwd cmd
    [[ -n "$pid" && "$pid" =~ ^[0-9]+$ ]] || return 1
    want="$(readlink -f "${APP_DIR}" 2>/dev/null || echo "${APP_DIR}")"
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [[ -n "$cwd" ]]; then
        if [[ "$cwd" == "$want" || "$cwd" == "${want}/server" || "$cwd" == "${want}/"* ]]; then
            return 0
        fi
    fi
    cmd="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"
    [[ -n "$cmd" ]] || return 1
    [[ "$cmd" == *"$want"* || "$cmd" == *"${APP_DIR}"* ]]
}

collect_listen_pids() {
    local port="$1"
    local out=""
    if command -v ss >/dev/null 2>&1; then
        out="$(ss -lntp 2>/dev/null | grep -E ":${port}([^0-9]|$)" | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)"
    fi
    if [[ -z "${out//[$' \t\n']/}" ]] && command -v lsof >/dev/null 2>&1; then
        out="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    fi
    if [[ -z "${out//[$' \t\n']/}" ]] && command -v fuser >/dev/null 2>&1; then
        out="$(fuser "${port}/tcp" 2>/dev/null || true)"
    fi
    echo "$out" | tr -s '[:space:]' '\n' | awk 'NF && !seen[$0]++'
}

_log_restart() {
    if type log >/dev/null 2>&1; then
        log "$*"
    else
        echo "[$(date '+%F %T')] $*"
    fi
}

# 只停「监听 API 端口且属于本仓库」的进程，避免误杀其它站点，也避免宝塔脚本重复启动导致 EADDRINUSE。
stop_app_listeners() {
    local port pid still i
    port="$(health_port)"
    local stopped=0
    while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        if process_belongs_to_app "$pid"; then
            _log_restart "停止占用端口 ${port} 的进程 pid=${pid} cwd=$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || echo '?')"
            if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
                stopped=1
                continue
            fi
            kill "$pid" 2>/dev/null || true
            stopped=1
        fi
    done < <(collect_listen_pids "$port")

    if [[ "${DRY_RUN:-0}" -eq 1 || "$stopped" -eq 0 ]]; then
        return 0
    fi

    for i in $(seq 1 10); do
        still=0
        while IFS= read -r pid; do
            [[ -n "$pid" ]] || continue
            if process_belongs_to_app "$pid"; then
                still=1
                if [[ "$i" -ge 8 ]]; then
                    kill -9 "$pid" 2>/dev/null || true
                fi
            fi
        done < <(collect_listen_pids "$port")
        [[ "$still" -eq 0 ]] && return 0
        sleep 1
    done
}

dump_restart_hints() {
    local bin script_dir port
    script_dir="$(baota_scripts_dir)"
    port="$(health_port)"
    _log_restart "which pm2 经常是 /usr/bin/pm2，其 list 为空并不代表 API 没在跑。"
    _log_restart "宝塔「网站 → Node 项目」用 $(baota_nodejs_root)/<版本>/bin/pm2 或 ${script_dir} 下的启动脚本。"
    if ! list_pm2_bins | grep -q .; then
        _log_restart "未找到任何 pm2 可执行文件。"
    fi
    while IFS= read -r bin; do
        [[ -n "$bin" ]] || continue
        _log_restart "PM2 列表 (${bin}):"
        "$bin" list 2>/dev/null || true
    done < <(list_pm2_bins)
    _log_restart "宝塔 Node 启动脚本目录: ${script_dir}"
    if [[ -d "$script_dir" ]]; then
        ls -1 "$script_dir" 2>/dev/null || _log_restart "  (目录为空)"
    else
        _log_restart "  (目录不存在)"
    fi
    _log_restart "端口 ${port} 监听进程:"
    if command -v ss >/dev/null 2>&1; then
        ss -lntp 2>/dev/null | grep -E ":${port}([^0-9]|$)" || _log_restart "  (ss 未看到 :${port})"
    else
        _log_restart "  (没有 ss 命令)"
    fi
    _log_restart "可在 deploy.env 设置 PM2_BIN、BAOTA_NODE_SCRIPT 或 RESTART_CMD。"
}
