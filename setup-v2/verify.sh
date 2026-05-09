#!/usr/bin/env bash
# verify.sh — post-setup posture check for the per-org Ubuntu server.
#
# Run as:   sudo bash verify.sh
# Behaviour: prints [PASS]/[FAIL]/[SKIP] per check, never aborts on failure
#            (so we get every result), exits 1 if any FAIL, 0 otherwise.
#
# Self-contained — only uses tools setup-server-v2.sh installs (ss, ps, stat,
# systemctl, ufw, nft, sudo, curl, sshd config parsing via awk/grep).

set -u

PASS_N=0
FAIL_N=0
SKIP_N=0
FAIL_LINES=()

C_PASS=$'\033[32m'
C_FAIL=$'\033[31m'
C_SKIP=$'\033[33m'
C_OFF=$'\033[0m'

# Disable colours if not on a TTY
if [ ! -t 1 ]; then
    C_PASS=""; C_FAIL=""; C_SKIP=""; C_OFF=""
fi

pass() {
    PASS_N=$((PASS_N + 1))
    printf '  %s[PASS]%s %s\n' "$C_PASS" "$C_OFF" "$1"
}

fail() {
    FAIL_N=$((FAIL_N + 1))
    printf '  %s[FAIL]%s %s\n' "$C_FAIL" "$C_OFF" "$1"
    FAIL_LINES+=("$1")
}

skip() {
    SKIP_N=$((SKIP_N + 1))
    printf '  %s[SKIP]%s %s\n' "$C_SKIP" "$C_OFF" "$1"
}

section() {
    printf '\n=== %s ===\n' "$1"
}

# Acceptable service-account names. setup-server-v2.sh may pick either.
DOABLE_USERS_REGEX='^(doable|doableapp)$'

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "WARNING: not running as root; some checks will be skipped or inaccurate." >&2
        echo "         Re-run with: sudo bash verify.sh" >&2
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Section 1 — Process posture
# ---------------------------------------------------------------------------
check_process_posture() {
    section "1. Process posture"

    # Build a snapshot once so each sub-check is consistent.
    local snap
    snap="$(ps -eo user=,pid=,comm=,args= 2>/dev/null)"

    # ---- next-server (Next.js) ----
    local next_lines
    next_lines="$(printf '%s\n' "$snap" | awk '$3 ~ /next-server/ || $0 ~ /next-server/' )"
    if [ -z "$next_lines" ]; then
        skip "next-server process not running"
    else
        local bad
        bad="$(printf '%s\n' "$next_lines" | awk '{print $1}' | grep -Ev "$DOABLE_USERS_REGEX" | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "next-server runs as service user (doable/doableapp)"
        else
            fail "next-server runs as: $(echo "$bad" | tr '\n' ' ')(expected doable/doableapp)"
        fi
    fi

    # ---- tsx watch (api/ws via tsx) ----
    local tsx_lines
    tsx_lines="$(printf '%s\n' "$snap" | grep -E 'tsx[ /].*watch|tsx watch' || true)"
    if [ -z "$tsx_lines" ]; then
        skip "tsx watch process not running"
    else
        local bad
        bad="$(printf '%s\n' "$tsx_lines" | awk '{print $1}' | grep -Ev "$DOABLE_USERS_REGEX" | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "tsx watch runs as service user (doable/doableapp)"
        else
            fail "tsx watch runs as: $(echo "$bad" | tr '\n' ' ')(expected doable/doableapp)"
        fi
    fi

    # ---- node services/ws / services/api (when not run via tsx) ----
    local node_doable
    node_doable="$(printf '%s\n' "$snap" | grep -E 'node .*(services/ws|services/api|/opt/doable|/srv/doable)' | grep -v grep || true)"
    if [ -z "$node_doable" ]; then
        skip "node api/ws process not running directly"
    else
        local bad
        bad="$(printf '%s\n' "$node_doable" | awk '{print $1}' | grep -Ev "$DOABLE_USERS_REGEX" | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "node (api/ws) runs as service user"
        else
            fail "node (api/ws) runs as: $(echo "$bad" | tr '\n' ' ')(expected doable/doableapp)"
        fi
    fi

    # ---- pnpm dev:* ----
    local pnpm_lines
    pnpm_lines="$(printf '%s\n' "$snap" | grep -E 'pnpm .*dev' | grep -v grep || true)"
    if [ -z "$pnpm_lines" ]; then
        skip "pnpm dev:* process not running"
    else
        local bad
        bad="$(printf '%s\n' "$pnpm_lines" | awk '{print $1}' | grep -Ev "$DOABLE_USERS_REGEX" | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "pnpm dev:* runs as service user"
        else
            fail "pnpm dev:* runs as: $(echo "$bad" | tr '\n' ' ')(expected doable/doableapp)"
        fi
    fi

    # ---- caddy ----
    local caddy_lines
    caddy_lines="$(printf '%s\n' "$snap" | grep -E '(^| )caddy( |$)|/caddy ' | grep -v grep || true)"
    if [ -z "$caddy_lines" ]; then
        fail "caddy not running"
    else
        local bad
        bad="$(printf '%s\n' "$caddy_lines" | awk '{print $1}' | grep -v '^caddy$' | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "caddy runs as caddy user"
        else
            fail "caddy runs as: $(echo "$bad" | tr '\n' ' ')(expected caddy)"
        fi
    fi

    # ---- postgres ----
    local pg_lines
    pg_lines="$(printf '%s\n' "$snap" | grep -E 'postgres' | grep -v grep || true)"
    if [ -z "$pg_lines" ]; then
        fail "postgres not running"
    else
        local bad
        bad="$(printf '%s\n' "$pg_lines" | awk '{print $1}' | grep -v '^postgres$' | sort -u || true)"
        if [ -z "$bad" ]; then
            pass "postgres runs as postgres user"
        else
            fail "postgres has non-postgres owner(s): $(echo "$bad" | tr '\n' ' ')"
        fi
    fi

    # ---- squid (worker should be 'proxy' on Debian/Ubuntu) ----
    local squid_lines
    squid_lines="$(printf '%s\n' "$snap" | grep -E '(^| )squid( |$)|/squid ' | grep -v grep || true)"
    if [ -z "$squid_lines" ]; then
        fail "squid not running"
    else
        # Squid master starts as root; worker (-k) drops to 'proxy'. Accept if
        # at least one squid process runs as 'proxy'.
        local users
        users="$(printf '%s\n' "$squid_lines" | awk '{print $1}' | sort -u | tr '\n' ' ')"
        if printf '%s\n' "$squid_lines" | awk '{print $1}' | grep -q '^proxy$'; then
            pass "squid worker runs as proxy (all users seen: $users)"
        else
            fail "squid worker is not running as proxy (users seen: $users)"
        fi
    fi

    # ---- cloudflared ----
    local cf_lines
    cf_lines="$(printf '%s\n' "$snap" | grep -E 'cloudflared' | grep -v grep || true)"
    if [ -z "$cf_lines" ]; then
        fail "cloudflared not running"
    else
        local users
        users="$(printf '%s\n' "$cf_lines" | awk '{print $1}' | sort -u | tr '\n' ' ')"
        # Acceptable: cloudflared (dedicated user) — preferred. Many setups
        # also run it as root via package default. Flag root as a soft fail
        # (FAIL — checklist requires non-root).
        local non_cf
        non_cf="$(printf '%s\n' "$cf_lines" | awk '{print $1}' | grep -v '^cloudflared$' | sort -u || true)"
        if [ -z "$non_cf" ]; then
            pass "cloudflared runs as cloudflared user"
        else
            fail "cloudflared runs as non-cloudflared user(s): $(echo "$non_cf" | tr '\n' ' ')(expected cloudflared)"
        fi
    fi

    # ---- catch-all: any 'doable' service still running as root? ----
    local doable_root
    doable_root="$(printf '%s\n' "$snap" \
        | awk '$1=="root" && ($0 ~ /\/opt\/doable|\/srv\/doable|\/root\/doable|next-server|tsx watch/ )' \
        || true)"
    if [ -n "$doable_root" ]; then
        fail "doable-related processes still running as root:"
        printf '%s\n' "$doable_root" | sed 's/^/        /'
    else
        pass "no doable-related processes owned by root"
    fi
}

# ---------------------------------------------------------------------------
# Section 2 — Network posture
# ---------------------------------------------------------------------------
check_network_posture() {
    section "2. Network posture"

    if ! command -v ss >/dev/null 2>&1; then
        skip "ss not available — cannot check listeners"
        return
    fi

    local listeners
    listeners="$(ss -H -tlnp 2>/dev/null || true)"
    if [ -z "$listeners" ]; then
        fail "ss returned no listening sockets — service stack not up?"
        return
    fi

    # 0.0.0.0 listeners other than sshd:22
    local bad_zero
    bad_zero="$(printf '%s\n' "$listeners" \
        | awk '$4 ~ /^0\.0\.0\.0:/ || $4 ~ /^\*:/ || $4 ~ /^\[::\]:/ {print}' \
        | awk '$4 !~ /:22$/' \
        || true)"
    if [ -z "$bad_zero" ]; then
        pass "no listeners on 0.0.0.0 except sshd:22"
    else
        fail "listeners bound to 0.0.0.0 other than sshd:22:"
        printf '%s\n' "$bad_zero" | sed 's/^/        /'
    fi

    # Specific ports must bind 127.0.0.1
    check_port_bound_loopback() {
        local port="$1"
        local label="$2"
        # Check there's a listener on this port
        local row
        row="$(printf '%s\n' "$listeners" | awk -v p=":$port" '$4 ~ p"$" {print $4; exit}')"
        if [ -z "$row" ]; then
            skip "port $port ($label) — nothing listening"
            return
        fi
        # Accept 127.0.0.1:<port> or [::1]:<port>
        if printf '%s\n' "$listeners" | awk -v p=":$port" '$4 ~ p"$"' \
            | grep -Eq '^[^ ]+ +[^ ]+ +[^ ]+ +(127\.0\.0\.1|\[::1\]):'"$port"'$'; then
            pass "port $port ($label) bound to loopback"
        else
            local where
            where="$(printf '%s\n' "$listeners" | awk -v p=":$port" '$4 ~ p"$" {print $4}' | tr '\n' ' ')"
            fail "port $port ($label) NOT bound to loopback (sockets: $where)"
        fi
    }

    check_port_bound_loopback 3000 "web/Next.js"
    check_port_bound_loopback 4000 "api"
    check_port_bound_loopback 4001 "ws"
    check_port_bound_loopback 5432 "postgres"
    check_port_bound_loopback 8080 "caddy"
    check_port_bound_loopback 3128 "squid"
}

# ---------------------------------------------------------------------------
# Section 3 — Filesystem posture
# ---------------------------------------------------------------------------
check_filesystem_posture() {
    section "3. Filesystem posture"

    # /opt/doable should be the install location
    if [ -d /opt/doable ]; then
        pass "/opt/doable exists"
        local owner
        owner="$(stat -c '%U:%G' /opt/doable 2>/dev/null || echo unknown)"
        case "$owner" in
            doable:doable|doableapp:doableapp)
                pass "/opt/doable owner is service account ($owner)"
                ;;
            *)
                fail "/opt/doable owner is $owner (expected doable:doable or doableapp:doableapp)"
                ;;
        esac
    else
        fail "/opt/doable does not exist (where is the app installed?)"
    fi

    # /root/doable should NOT exist (or, if it does, app should not be there)
    if [ -d /root/doable ]; then
        # Tolerate an empty / leftover dir; only fail if it has app files.
        if [ -f /root/doable/.env ] || [ -d /root/doable/apps ] || [ -d /root/doable/services ]; then
            fail "/root/doable still contains the app — should be at /opt/doable"
        else
            pass "/root/doable exists but is empty / no app artefacts"
        fi
    else
        pass "/root/doable does not exist (good — app moved to /opt/doable)"
    fi

    # /opt/doable/.env permissions
    local env_path=/opt/doable/.env
    if [ -f "$env_path" ]; then
        pass ".env exists at $env_path"

        local mode owner
        mode="$(stat -c '%a' "$env_path" 2>/dev/null || echo ?)"
        owner="$(stat -c '%U:%G' "$env_path" 2>/dev/null || echo unknown)"

        if [ "$mode" = "600" ]; then
            pass ".env mode is 600"
        else
            fail ".env mode is $mode (expected 600)"
        fi

        case "$owner" in
            doable:doable|doableapp:doableapp|root:root)
                pass ".env owner is $owner (acceptable)"
                ;;
            *)
                fail ".env owner is $owner (expected doable:doable, doableapp:doableapp, or root:root)"
                ;;
        esac

        # Crucial: a sandbox-class user must not be able to read it.
        if id nobody >/dev/null 2>&1; then
            if sudo -u nobody test -r "$env_path" 2>/dev/null; then
                fail ".env is readable by 'nobody' — sandbox UIDs can read secrets"
            else
                pass ".env is NOT readable by 'nobody'"
            fi
        else
            skip "user 'nobody' does not exist on this system"
        fi
    else
        fail ".env not found at $env_path"
    fi
}

# ---------------------------------------------------------------------------
# Section 4 — SSH posture
# ---------------------------------------------------------------------------
check_ssh_posture() {
    section "4. SSH posture"

    local cfg=/etc/ssh/sshd_config
    if [ ! -f "$cfg" ]; then
        skip "sshd_config not found at $cfg"
        return
    fi

    # Parse via sshd -T when possible (resolves drop-ins + defaults).
    local effective=""
    if command -v sshd >/dev/null 2>&1; then
        effective="$(sshd -T 2>/dev/null || true)"
    fi

    get_setting() {
        local key="$1"
        local key_lc
        key_lc="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
        local val=""
        if [ -n "$effective" ]; then
            # sshd -T outputs lower-case keys
            val="$(printf '%s\n' "$effective" \
                | awk -v k="$key_lc" 'tolower($1)==k {sub(/^[^ ]+ /,""); print; exit}')"
        fi
        if [ -z "$val" ]; then
            # Fall back to the on-disk file (last non-comment match wins).
            val="$(grep -Ei "^[[:space:]]*${key}[[:space:]]+" "$cfg" 2>/dev/null \
                | grep -v '^[[:space:]]*#' \
                | tail -n1 \
                | awk '{sub(/^[^ \t]+[ \t]+/,""); print}')"
        fi
        printf '%s' "$val"
    }

    local prl pa pk
    prl="$(get_setting PermitRootLogin)"
    pa="$(get_setting PasswordAuthentication)"
    pk="$(get_setting PubkeyAuthentication)"

    if [ "$(printf '%s' "$prl" | tr '[:upper:]' '[:lower:]')" = "no" ]; then
        pass "PermitRootLogin = no"
    else
        fail "PermitRootLogin = '${prl:-<unset>}' (expected no)"
    fi

    if [ "$(printf '%s' "$pa" | tr '[:upper:]' '[:lower:]')" = "no" ]; then
        pass "PasswordAuthentication = no"
    else
        fail "PasswordAuthentication = '${pa:-<unset>}' (expected no)"
    fi

    if [ "$(printf '%s' "$pk" | tr '[:upper:]' '[:lower:]')" = "yes" ]; then
        pass "PubkeyAuthentication = yes"
    else
        fail "PubkeyAuthentication = '${pk:-<unset>}' (expected yes)"
    fi
}

# ---------------------------------------------------------------------------
# Section 5 — Firewall + hardening services
# ---------------------------------------------------------------------------
check_firewall_and_services() {
    section "5. Firewall + hardening"

    # ---- ufw ----
    if command -v ufw >/dev/null 2>&1; then
        local ufw_out
        ufw_out="$(ufw status verbose 2>/dev/null || true)"
        if printf '%s' "$ufw_out" | grep -qiE '^Status:[[:space:]]+active'; then
            pass "ufw is active"
        else
            fail "ufw not active (status output: $(printf '%s' "$ufw_out" | head -1))"
        fi

        if printf '%s' "$ufw_out" | grep -qiE 'default:.*deny.*\(incoming\)'; then
            pass "ufw default deny incoming"
        else
            fail "ufw default policy is not 'deny incoming'"
        fi

        # Only OpenSSH should be in the allow list. Be tolerant of v6 dup.
        local allow_rules
        allow_rules="$(printf '%s\n' "$ufw_out" \
            | awk '/^---/{flag=1; next} flag' \
            | awk '$0 ~ /ALLOW/' \
            | awk '{print $1}' \
            | sort -u \
            | tr '\n' ' ' \
            | sed 's/ *$//')"
        # We expect roughly: '22 22/tcp OpenSSH' or '22/tcp OpenSSH (v6)' — anything
        # other than ssh is a finding.
        if printf '%s\n' "$ufw_out" | grep -qiE 'OpenSSH|22/tcp'; then
            local extras
            extras="$(printf '%s\n' "$ufw_out" \
                | awk '/^---/{flag=1; next} flag' \
                | awk '$0 ~ /ALLOW/ && $0 !~ /OpenSSH/ && $0 !~ /22\/tcp/' \
                || true)"
            if [ -z "$extras" ]; then
                pass "ufw allow list contains only OpenSSH/22"
            else
                fail "ufw allow list has extras beyond SSH:"
                printf '%s\n' "$extras" | sed 's/^/        /'
            fi
        else
            fail "ufw does not allow OpenSSH/22 — host may be locked out on reboot"
        fi
    else
        skip "ufw not installed"
    fi

    # ---- systemctl is-active for hardening services ----
    local svc
    for svc in fail2ban unattended-upgrades postgresql caddy cloudflared doable nftables; do
        if systemctl list-unit-files 2>/dev/null | awk '{print $1}' | grep -qE "^${svc}\.service$|^${svc}\.timer$"; then
            local state
            state="$(systemctl is-active "$svc" 2>/dev/null || true)"
            case "$state" in
                active)
                    pass "$svc is active"
                    ;;
                *)
                    fail "$svc is '$state' (expected active)"
                    ;;
            esac
        else
            # unattended-upgrades on Ubuntu may register as a timer rather than a service.
            if [ "$svc" = "unattended-upgrades" ] && systemctl list-unit-files 2>/dev/null | grep -q '^apt-daily-upgrade\.timer'; then
                local state
                state="$(systemctl is-active apt-daily-upgrade.timer 2>/dev/null || true)"
                case "$state" in
                    active)
                        pass "apt-daily-upgrade.timer is active (proxy for unattended-upgrades)"
                        ;;
                    *)
                        fail "unattended-upgrades / apt-daily-upgrade.timer is '$state'"
                        ;;
                esac
            else
                fail "$svc unit not present on system"
            fi
        fi
    done

    # ---- nft ruleset must include skuid (egress jail per FINDINGS.md / 04-egress-jail.md) ----
    if command -v nft >/dev/null 2>&1; then
        local nft_out
        nft_out="$(nft list ruleset 2>/dev/null || true)"
        if [ -z "$nft_out" ]; then
            fail "nft list ruleset empty (no firewall rules loaded)"
        elif printf '%s' "$nft_out" | grep -q 'skuid'; then
            pass "nft ruleset contains skuid rule (egress jail in place)"
        else
            fail "nft ruleset has no 'skuid' match (sandbox egress jail not configured)"
        fi
    else
        skip "nft not installed"
    fi

    # ---- squid listening 127.0.0.1:3128 (port-level check) ----
    if command -v ss >/dev/null 2>&1; then
        if ss -H -tlnp 2>/dev/null | awk '$4 ~ /:3128$/' \
            | grep -Eq '127\.0\.0\.1:3128|\[::1\]:3128'; then
            pass "squid listening on 127.0.0.1:3128"
        else
            fail "squid not listening on 127.0.0.1:3128"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Section 6 — Egress smoke (as the doable user)
# ---------------------------------------------------------------------------
check_egress_smoke() {
    section "6. Egress smoke (sandbox + service-user reachability)"

    # Pick whichever service user actually exists.
    local svc_user=""
    if id doable >/dev/null 2>&1; then
        svc_user=doable
    elif id doableapp >/dev/null 2>&1; then
        svc_user=doableapp
    fi

    if [ -z "$svc_user" ]; then
        skip "neither doable nor doableapp user exists; cannot run egress probes"
        return
    fi

    if ! command -v curl >/dev/null 2>&1; then
        skip "curl not installed; cannot run egress probes"
        return
    fi

    # GitHub — must be in the allowlist (used for git clone of connected repos)
    if sudo -u "$svc_user" -- curl -m 5 -fsSL https://api.github.com/zen >/dev/null 2>&1; then
        pass "as $svc_user: api.github.com reachable (allowlisted egress works)"
    else
        fail "as $svc_user: api.github.com NOT reachable in 5s — egress jail too tight or DNS broken"
    fi

    # example.com — should reach via direct allowlist OR via Squid (BUILD_HTTP_PROXY).
    # Try direct first.
    if sudo -u "$svc_user" -- curl -m 5 -fsSL https://example.com/ >/dev/null 2>&1; then
        pass "as $svc_user: example.com reachable (direct or via allowlist)"
    else
        # Try via Squid explicitly.
        if sudo -u "$svc_user" -- curl -m 5 -fsSL -x http://127.0.0.1:3128 https://example.com/ >/dev/null 2>&1; then
            pass "as $svc_user: example.com reachable via Squid proxy (127.0.0.1:3128)"
        else
            fail "as $svc_user: example.com unreachable both directly and via Squid proxy"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Section 7 — App health (only if started)
# ---------------------------------------------------------------------------
check_app_health() {
    section "7. App health"

    if ! command -v curl >/dev/null 2>&1; then
        skip "curl not installed; cannot probe app endpoints"
        return
    fi

    # API /health on 4000
    local health_body health_code
    health_body="$(curl -fsSL -o /tmp/doable-verify-health.$$ -w '%{http_code}' -m 5 http://127.0.0.1:4000/health 2>/dev/null || true)"
    health_code="$health_body"
    if [ "$health_code" = "200" ]; then
        if grep -q '"status":"healthy"' /tmp/doable-verify-health.$$ 2>/dev/null; then
            pass "GET http://127.0.0.1:4000/health = 200 with status:healthy"
        else
            fail "GET http://127.0.0.1:4000/health = 200 but body lacks status:healthy"
        fi
    else
        # If api isn't up at all, treat as SKIP (script still useful pre-app-start).
        if curl -s -o /dev/null -m 2 http://127.0.0.1:4000 2>/dev/null; then
            fail "GET http://127.0.0.1:4000/health did not return 200 (got: ${health_code:-no-response})"
        else
            skip "api on 127.0.0.1:4000 not reachable — services not started yet?"
        fi
    fi
    rm -f /tmp/doable-verify-health.$$ 2>/dev/null || true

    # Web /login on 3000
    local login_body_file=/tmp/doable-verify-login.$$
    local login_code
    login_code="$(curl -fsSL -o "$login_body_file" -w '%{http_code}' -m 5 http://127.0.0.1:3000/login 2>/dev/null || true)"
    if [ "$login_code" = "200" ]; then
        if grep -qiE '<html|<!doctype html' "$login_body_file" 2>/dev/null; then
            pass "GET http://127.0.0.1:3000/login = 200 (HTML body)"
        else
            fail "GET http://127.0.0.1:3000/login = 200 but body is not HTML"
        fi
    else
        if curl -s -o /dev/null -m 2 http://127.0.0.1:3000 2>/dev/null; then
            fail "GET http://127.0.0.1:3000/login did not return 200 (got: ${login_code:-no-response})"
        else
            skip "web on 127.0.0.1:3000 not reachable — services not started yet?"
        fi
    fi
    rm -f "$login_body_file" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo "verify.sh — running on $(hostname) at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

    if ! require_root; then
        echo "(continuing in best-effort mode — many checks may degrade to SKIP/FAIL)"
    fi

    check_process_posture
    check_network_posture
    check_filesystem_posture
    check_ssh_posture
    check_firewall_and_services
    check_egress_smoke
    check_app_health

    echo
    printf '=== RESULT: %d PASS, %d FAIL, %d SKIP ===\n' "$PASS_N" "$FAIL_N" "$SKIP_N"

    if [ "$FAIL_N" -gt 0 ]; then
        echo
        echo "Failed checks:"
        local line
        for line in "${FAIL_LINES[@]}"; do
            echo "  - $line"
        done
        exit 1
    fi
    exit 0
}

main "$@"
