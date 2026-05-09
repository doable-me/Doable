#!/usr/bin/env bash
# doable — operator CLI for Doable servers (v3)
#
# Installed at /usr/local/bin/doable. Wraps systemctl/journalctl/tmux for the
# three doable services (api, web, ws) plus the cloudflared tunnel and the
# postgres dependency. Designed for ops use on a freshly v3-installed server.
#
# Usage:
#     doable status            # one-page status of api/web/ws + DB + tunnel
#     doable logs <api|web|ws|all>
#     doable restart <api|web|ws|all>
#     doable attach            # tmux session 'doable-debug' with 4 panes
#     doable tail              # follow journals across api/web/ws + cloudflared
#     doable health            # curl /health on each service
#     doable env               # print non-secret env vars
#     doable install           # copy self to /usr/local/bin/doable, mode 755
#     doable help

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

readonly SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly INSTALL_PATH="/usr/local/bin/doable"
readonly TARGET_UNIT="/etc/systemd/system/doable.target"
readonly APP_USER="${DOABLE_USER:-doable}"
readonly APP_HOME="${DOABLE_HOME:-/opt/doable}"
readonly ENV_FILE="${APP_HOME}/.env"

readonly UNITS=(doable-api.service doable-web.service doable-ws.service)
readonly UNIT_LABELS=(api web ws)

# Color codes — disable if not on a TTY
if [[ -t 1 ]]; then
    readonly C_RED=$'\033[31m'
    readonly C_GRN=$'\033[32m'
    readonly C_YEL=$'\033[33m'
    readonly C_BLU=$'\033[34m'
    readonly C_DIM=$'\033[2m'
    readonly C_BLD=$'\033[1m'
    readonly C_RST=$'\033[0m'
else
    readonly C_RED=""; readonly C_GRN=""; readonly C_YEL=""
    readonly C_BLU=""; readonly C_DIM=""; readonly C_BLD=""; readonly C_RST=""
fi

readonly ICON_OK="${C_GRN}✓${C_RST}"   # ✓
readonly ICON_BAD="${C_RED}✗${C_RST}"  # ✗
readonly ICON_WRN="${C_YEL}⚠${C_RST}"  # ⚠

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Print to stderr.
err() { printf '%s\n' "$*" >&2; }

# Pretty section header.
section() {
    printf '\n%b%s%b\n' "$C_BLD" "$1" "$C_RST"
    printf '%b%s%b\n' "$C_DIM" "$(printf '%.0s-' $(seq 1 ${#1}))" "$C_RST"
}

# Refuse to run unless v3 services are installed. Lets `install` and `help`
# bypass so first-run is possible.
require_installed() {
    if [[ ! -f "$TARGET_UNIT" ]]; then
        err "${ICON_BAD@P} doable.target not found at $TARGET_UNIT"
        err "    This server doesn't look like a v3 install."
        err "    Run setup-server-v3.sh first, or 'doable install' to copy this CLI."
        exit 1
    fi
}

# Map "api" -> "doable-api.service" etc. Echoes the unit name.
unit_for() {
    case "$1" in
        api) echo "doable-api.service" ;;
        web) echo "doable-web.service" ;;
        ws)  echo "doable-ws.service" ;;
        *)   err "unknown service: $1 (want api|web|ws)"; exit 2 ;;
    esac
}

# True (0) if running as root. Some subcommands need it; we sudo if not.
is_root() { [[ $EUID -eq 0 ]]; }

# Run a privileged command — directly if root, else via sudo.
priv() {
    if is_root; then "$@"; else sudo "$@"; fi
}

# Echo "active" / "inactive" / "failed" for a unit.
unit_state() {
    systemctl is-active "$1" 2>/dev/null || true
}

# Echo uptime for an active unit, or "—".
unit_uptime() {
    local unit=$1
    local since
    since=$(systemctl show "$unit" -p ActiveEnterTimestamp --value 2>/dev/null || true)
    if [[ -z "$since" || "$since" == "n/a" ]]; then
        echo "—"
    else
        # Convert to relative time using `date -d`.
        local epoch now diff
        epoch=$(date -d "$since" +%s 2>/dev/null || echo 0)
        now=$(date +%s)
        diff=$(( now - epoch ))
        if   (( diff < 60 ));    then echo "${diff}s"
        elif (( diff < 3600 ));  then echo "$((diff/60))m"
        elif (( diff < 86400 )); then echo "$((diff/3600))h"
        else                          echo "$((diff/86400))d"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Subcommand: help
# ---------------------------------------------------------------------------

cmd_help() {
    cat <<'EOF'
doable — operator CLI for Doable v3

USAGE
    doable <command> [args]

COMMANDS
    status                One-page status of api/web/ws + DB + tunnel
    logs <svc>            Follow journal for one service (svc = api|web|ws|all)
    restart <svc>         Restart a service (svc = api|web|ws|all)
    attach                Open tmux 'doable-debug' with 4 panes (api/web/ws/htop)
    tail                  Follow journals across api/web/ws + cloudflared
    health                Curl /health on each service, print HTTP status
    env                   Print non-secret env vars from /opt/doable/.env
    install               Copy self to /usr/local/bin/doable, chmod 755
    help                  Show this help

EXAMPLES
    doable status
    doable logs api
    doable restart all
    doable attach              # then ctrl-b d to detach without stopping

NOTES
    - Requires the v3 setup (doable.target + doable-{api,web,ws}.service).
    - Most commands use sudo when not run as root.
EOF
}

# ---------------------------------------------------------------------------
# Subcommand: install
# ---------------------------------------------------------------------------

cmd_install() {
    if [[ "$SCRIPT_PATH" == "$INSTALL_PATH" ]]; then
        err "${ICON_WRN@P} already installed at $INSTALL_PATH (running from there)"
        exit 0
    fi
    echo "Installing $SCRIPT_PATH -> $INSTALL_PATH"
    priv install -m 0755 "$SCRIPT_PATH" "$INSTALL_PATH"
    printf '%b installed: %s\n' "${ICON_OK@P}" "$INSTALL_PATH"
}

# ---------------------------------------------------------------------------
# Subcommand: status
# ---------------------------------------------------------------------------

cmd_status() {
    require_installed

    section "Doable services"
    printf '%-10s %-10s %-8s %s\n' "SERVICE" "STATE" "UPTIME" "UNIT"
    for i in "${!UNITS[@]}"; do
        local label=${UNIT_LABELS[$i]}
        local unit=${UNITS[$i]}
        local state; state=$(unit_state "$unit")
        local up;    up=$(unit_uptime "$unit")
        local icon
        case "$state" in
            active)   icon=$ICON_OK ;;
            inactive) icon=$ICON_WRN ;;
            failed|*) icon=$ICON_BAD ;;
        esac
        printf '%-10s %b %-8s %-8s %s\n' "$label" "${icon@P}" "$state" "$up" "$unit"
    done

    section "Database (postgresql)"
    local pg_state; pg_state=$(unit_state postgresql)
    if [[ "$pg_state" == "active" ]]; then
        printf '%b postgresql active\n' "${ICON_OK@P}"
        if command -v psql >/dev/null 2>&1; then
            # Try a trivial query via socket as the doable user, if it exists.
            if priv -u "$APP_USER" psql -tAc 'SELECT 1' postgres >/dev/null 2>&1; then
                printf '%b SELECT 1 OK as %s\n' "${ICON_OK@P}" "$APP_USER"
            else
                printf '%b SELECT 1 failed as %s (check pg_hba)\n' "${ICON_WRN@P}" "$APP_USER"
            fi
        fi
    else
        printf '%b postgresql %s\n' "${ICON_BAD@P}" "$pg_state"
    fi

    section "Cloudflare tunnel"
    local cf_state; cf_state=$(unit_state cloudflared)
    if [[ "$cf_state" == "active" ]]; then
        printf '%b cloudflared active\n' "${ICON_OK@P}"
    else
        printf '%b cloudflared %s\n' "${ICON_BAD@P}" "$cf_state"
    fi

    section "Listeners (127.0.0.1 only)"
    if command -v ss >/dev/null 2>&1; then
        # Show non-loopback listeners as a warning — should be zero.
        local non_local
        non_local=$(ss -tlnH 2>/dev/null | awk '$4 !~ /^127\./ && $4 !~ /^\[::1\]/ && $4 !~ /:22$/ {print $4}' || true)
        if [[ -z "$non_local" ]]; then
            printf '%b only 127.0.0.1 + sshd listeners\n' "${ICON_OK@P}"
        else
            printf '%b non-loopback listeners detected:\n%s\n' "${ICON_WRN@P}" "$non_local"
        fi
    fi

    echo
}

# ---------------------------------------------------------------------------
# Subcommand: logs
# ---------------------------------------------------------------------------

cmd_logs() {
    require_installed
    local target=${1:-}
    if [[ -z "$target" ]]; then
        err "usage: doable logs <api|web|ws|all>"
        exit 2
    fi

    if [[ "$target" == "all" ]]; then
        # Multiplex via journalctl --unit-pattern (modern journalctl) with
        # fallback to repeated -u flags.
        if priv journalctl --help 2>&1 | grep -q -- '--unit-pattern'; then
            priv journalctl --unit-pattern='doable-*.service' -f --no-pager
        else
            priv journalctl -u doable-api.service \
                            -u doable-web.service \
                            -u doable-ws.service -f --no-pager
        fi
        return
    fi

    local unit; unit=$(unit_for "$target")
    priv journalctl -u "$unit" -f --no-pager
}

# ---------------------------------------------------------------------------
# Subcommand: restart
# ---------------------------------------------------------------------------

cmd_restart() {
    require_installed
    local target=${1:-}
    if [[ -z "$target" ]]; then
        err "usage: doable restart <api|web|ws|all>"
        exit 2
    fi

    if [[ "$target" == "all" ]]; then
        echo "Restarting doable.target ..."
        priv systemctl restart doable.target
        printf '%b doable.target restarted\n' "${ICON_OK@P}"
        return
    fi

    local unit; unit=$(unit_for "$target")
    echo "Restarting $unit ..."
    priv systemctl restart "$unit"
    printf '%b %s restarted\n' "${ICON_OK@P}" "$unit"
}

# ---------------------------------------------------------------------------
# Subcommand: attach
# ---------------------------------------------------------------------------
# Spawn a tmux session 'doable-debug' with 4 panes:
#   pane 0 (top-left)     journalctl -u doable-api.service -f
#   pane 1 (mid-left)     journalctl -u doable-web.service -f
#   pane 2 (bottom-left)  journalctl -u doable-ws.service  -f
#   pane 3 (right)        htop -u doable
#
# If the session already exists, just attach.

cmd_attach() {
    require_installed
    if ! command -v tmux >/dev/null 2>&1; then
        err "${ICON_BAD@P} tmux not installed. apt install tmux"
        exit 1
    fi

    local sess=doable-debug
    if tmux has-session -t "$sess" 2>/dev/null; then
        echo "attaching to existing '$sess'"
        exec tmux attach -t "$sess"
    fi

    # Build session detached, then attach at the end.
    tmux new-session -d -s "$sess" -n logs \
        "sudo journalctl -u doable-api.service -f --no-pager"
    # Split horizontally to make the right column.
    tmux split-window -t "$sess:logs" -h \
        "if command -v htop >/dev/null 2>&1; then htop -u $APP_USER; else top -u $APP_USER; fi"
    # Back to the left column, split vertically twice for web + ws.
    tmux select-pane -t "$sess:logs.0"
    tmux split-window -t "$sess:logs.0" -v \
        "sudo journalctl -u doable-web.service -f --no-pager"
    tmux select-pane -t "$sess:logs.1"
    tmux split-window -t "$sess:logs.1" -v \
        "sudo journalctl -u doable-ws.service -f --no-pager"

    tmux select-pane -t "$sess:logs.0"
    exec tmux attach -t "$sess"
}

# ---------------------------------------------------------------------------
# Subcommand: tail
# ---------------------------------------------------------------------------

cmd_tail() {
    require_installed
    priv journalctl \
        -u doable-api.service \
        -u doable-web.service \
        -u doable-ws.service \
        -u cloudflared.service \
        -f --no-pager
}

# ---------------------------------------------------------------------------
# Subcommand: health
# ---------------------------------------------------------------------------
# Reads ports from .env so the CLI doesn't drift from the unit files.

cmd_health() {
    require_installed
    if ! command -v curl >/dev/null 2>&1; then
        err "${ICON_BAD@P} curl not installed"
        exit 1
    fi

    # Defaults match v3 setup; overridable via .env.
    local api_port=${API_PORT:-8787}
    local web_port=${WEB_PORT:-3000}
    local ws_port=${WS_PORT:-1234}

    if [[ -r "$ENV_FILE" ]]; then
        # shellcheck disable=SC1090
        api_port=$(awk -F= '/^API_PORT=/  {print $2; exit}' "$ENV_FILE" 2>/dev/null || echo "$api_port")
        web_port=$(awk -F= '/^PORT=/      {print $2; exit}' "$ENV_FILE" 2>/dev/null || echo "$web_port")
        ws_port=$( awk -F= '/^WS_PORT=/   {print $2; exit}' "$ENV_FILE" 2>/dev/null || echo "$ws_port")
    fi

    section "Health checks (127.0.0.1)"
    _hit() {
        local label=$1 url=$2
        local code
        code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
        local icon=$ICON_BAD
        [[ "$code" == "200" ]] && icon=$ICON_OK
        [[ "$code" =~ ^3 ]]    && icon=$ICON_WRN
        printf '%b %-6s %-40s %s\n' "${icon@P}" "$label" "$url" "$code"
    }

    _hit api "http://127.0.0.1:${api_port}/health"
    _hit web "http://127.0.0.1:${web_port}/api/health"
    _hit ws  "http://127.0.0.1:${ws_port}/health"
    echo
}

# ---------------------------------------------------------------------------
# Subcommand: env
# ---------------------------------------------------------------------------
# Prints public, non-secret config so an operator can verify hostnames etc.
# Anything matching SECRET / TOKEN / KEY / PASSWORD is redacted.

cmd_env() {
    require_installed
    if [[ ! -r "$ENV_FILE" ]]; then
        err "${ICON_BAD@P} cannot read $ENV_FILE (try sudo)"
        exit 1
    fi

    section "Non-secret env (${ENV_FILE})"
    # Allowlist of variable names safe to display.
    local allow='^(DOABLE_DOMAIN|API_HOST|WS_HOST|API_PORT|WS_PORT|PORT|PUBLISH_SUBDOMAIN_PREFIX|CLOUDFLARED_TUNNEL_ID|NODE_ENV|DOABLE_USER|DOABLE_HOME|SITES_DIR|BUILD_HTTP_PROXY)='
    grep -E "$allow" "$ENV_FILE" 2>/dev/null | sort || true
    echo
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

main() {
    local cmd=${1:-help}
    [[ $# -gt 0 ]] && shift || true

    case "$cmd" in
        status)   cmd_status   "$@" ;;
        logs)     cmd_logs     "$@" ;;
        restart)  cmd_restart  "$@" ;;
        attach)   cmd_attach   "$@" ;;
        tail)     cmd_tail     "$@" ;;
        health)   cmd_health   "$@" ;;
        env)      cmd_env      "$@" ;;
        install)  cmd_install  "$@" ;;
        help|-h|--help) cmd_help ;;
        *) err "unknown command: $cmd"; cmd_help; exit 2 ;;
    esac
}

main "$@"
