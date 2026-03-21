#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Doable — Emergency Recovery Script                         ║
# ║  Run this on a COMPROMISED server via DigitalOcean Console  ║
# ║  to kill malware, dump the database, and clean up.          ║
# ╚══════════════════════════════════════════════════════════════╝
#
# USAGE (paste these commands into the DigitalOcean Console):
#   curl -fsSL https://raw.githubusercontent.com/computersrmyfriends/doable/main/emergency-recovery.sh | bash
#   — OR —
#   Copy-paste this script directly into the console
#
# WHAT THIS DOES:
#   1. Kills known malware processes
#   2. Removes malware files and persistence mechanisms
#   3. Dumps the PostgreSQL database to /tmp/doable_backup.sql
#   4. Re-enables SSH so you can scp the backup off
#   5. Prints next steps
#
# AFTER RUNNING THIS: Destroy the droplet and rebuild fresh.

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║      Doable — Emergency Recovery (Compromised Server)    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Kill malware ────────────────────────────────────
info "Step 1: Killing malware processes..."

# Kill known malware patterns
for pattern in persistence manji kinsing kdevtmpfsi xmrig minerd cryptonight; do
  PIDS=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    ok "Killed processes matching: $pattern"
  fi
done

# ─── Step 2: Remove malware files ────────────────────────────
info "Step 2: Removing malware files..."

# Common malware locations
for f in /tmp/persistence.sh /tmp/manji* /tmp/.X11-unix/.* /var/tmp/.* /dev/shm/.*; do
  if [[ -e "$f" ]] && [[ "$f" != "/tmp/." ]] && [[ "$f" != "/tmp/.." ]]; then
    rm -rf "$f" 2>/dev/null && ok "Removed: $f"
  fi
done

# ─── Step 3: Clean persistence mechanisms ─────────────────────
info "Step 3: Cleaning persistence mechanisms..."

# Check and clean crontabs
for user in root $(awk -F: '$3>=1000{print $1}' /etc/passwd); do
  CRON=$(crontab -u "$user" -l 2>/dev/null || true)
  if echo "$CRON" | grep -qiE 'persistence|manji|curl.*sh|wget.*sh|/tmp/|/dev/shm'; then
    warn "Suspicious crontab found for $user — clearing"
    crontab -u "$user" -r 2>/dev/null || true
    ok "Cleared crontab for $user"
  fi
done

# Check for malicious systemd services
for svc in $(systemctl list-unit-files --type=service --no-pager 2>/dev/null | grep -iE 'manji|persist|kinsing|miner' | awk '{print $1}'); do
  systemctl stop "$svc" 2>/dev/null || true
  systemctl disable "$svc" 2>/dev/null || true
  ok "Disabled suspicious service: $svc"
done

# Check authorized_keys for injected keys
if [[ -f /root/.ssh/authorized_keys ]]; then
  LINES_BEFORE=$(wc -l < /root/.ssh/authorized_keys)
  # Remove lines that look injected (contain common malware markers)
  grep -v -iE 'manji|kinsing|redis|exploit' /root/.ssh/authorized_keys > /tmp/clean_keys 2>/dev/null || true
  mv /tmp/clean_keys /root/.ssh/authorized_keys 2>/dev/null || true
  chmod 600 /root/.ssh/authorized_keys
  LINES_AFTER=$(wc -l < /root/.ssh/authorized_keys)
  if [[ "$LINES_BEFORE" != "$LINES_AFTER" ]]; then
    warn "Removed $(( LINES_BEFORE - LINES_AFTER )) suspicious SSH keys"
  fi
fi

# ─── Step 4: Dump database ───────────────────────────────────
info "Step 4: Dumping PostgreSQL database..."

# Ensure PostgreSQL is running
systemctl start postgresql 2>/dev/null || true
sleep 2

if sudo -u postgres pg_dump doable > /tmp/doable_backup.sql 2>/dev/null; then
  BACKUP_SIZE=$(ls -lh /tmp/doable_backup.sql | awk '{print $5}')
  ok "Database dumped to /tmp/doable_backup.sql (${BACKUP_SIZE})"
else
  warn "Database dump failed — PostgreSQL may not be running or 'doable' DB doesn't exist"
  # Try alternative method
  if command -v pg_dump &>/dev/null; then
    PGPASSWORD=doable pg_dump -h localhost -U doable doable > /tmp/doable_backup.sql 2>/dev/null \
      && ok "Database dumped (alternative method)" \
      || warn "Both dump methods failed"
  fi
fi

# ─── Step 5: Re-enable SSH ───────────────────────────────────
info "Step 5: Re-enabling SSH..."

# Fix SSH
apt-get install -y openssh-server 2>/dev/null || true
systemctl enable ssh 2>/dev/null || systemctl enable sshd 2>/dev/null || true
systemctl start ssh 2>/dev/null || systemctl start sshd 2>/dev/null || true

# Fix firewall if UFW is blocking SSH
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp 2>/dev/null || true
  # If UFW is active and SSH is still blocked, just disable it temporarily
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    if ! ufw status 2>/dev/null | grep -qE "22/tcp.*ALLOW"; then
      ufw --force disable
      warn "UFW disabled — SSH was blocked"
    fi
  fi
fi

# Verify SSH is actually listening
if ss -tlnp | grep -q ':22 '; then
  ok "SSH is listening on port 22"
else
  warn "SSH is NOT listening — may need manual intervention"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                Recovery Complete                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Database backup: /tmp/doable_backup.sql"
echo ""
echo "  ── Next Steps ──"
echo "  1. From your local machine, copy the backup:"
echo "     scp -i <key> root@<server-ip>:/tmp/doable_backup.sql ."
echo ""
echo "  2. DESTROY this droplet (it cannot be trusted)"
echo ""
echo "  3. Create a fresh droplet and run setup-server.sh"
echo "     (now hardened with UFW, Redis auth, fail2ban)"
echo ""
echo "  4. Restore the database on the new server:"
echo "     psql -U doable -d doable < doable_backup.sql"
echo ""
echo "  5. Rotate ALL credentials:"
echo "     - Database password"
echo "     - JWT secret"
echo "     - OAuth tokens"
echo "     - API keys (Anthropic, OpenAI, Stripe)"
echo "     - Cloudflare tunnel credentials"
echo ""
warn "DO NOT keep using this server. Destroy it after extracting the backup."
echo ""
