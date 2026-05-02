#!/bin/bash
# Doable Wave 29 — setup-build-proxy.sh
#
# Installs Squid on Ubuntu 22.04/24.04 with a default allow-list for
# build-time outbound traffic. Apps' build steps (next build, npm install,
# pip install, etc.) point BUILD_HTTP_PROXY=http://127.0.0.1:3128 at this
# proxy. Only the listed registries are reachable; everything else gets
# HTTP 403.
#
# Usage:
#   sudo ./scripts/setup-build-proxy.sh
#
# Make it executable first:
#   chmod +x scripts/setup-build-proxy.sh
#
# Idempotent — safe to re-run.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (try: sudo $0)" >&2
  exit 1
fi

# 1. Install squid (idempotent — skip work if already installed)
if ! dpkg -s squid >/dev/null 2>&1; then
  echo "Installing squid..."
  apt-get update -y
  apt-get install -y squid
else
  echo "squid already installed — skipping apt-get install."
fi

# 2. Write the Doable allow-list config
mkdir -p /etc/squid/conf.d
cat > /etc/squid/conf.d/doable-allowlist.conf <<'EOF'
# Doable Wave 29 — allow-list for build-time outbound traffic.
# Apps' build steps (next build, npm install, pip install, etc.) point
# BUILD_HTTP_PROXY=http://127.0.0.1:3128 at this proxy. Only the listed
# registries are reachable; everything else gets HTTP 403.

http_port 127.0.0.1:3128

# Allow-list of build-time hosts (CONNECT for HTTPS, GET/POST for HTTP)
acl doable_allow dstdomain \
  registry.npmjs.org \
  registry.yarnpkg.com \
  files.pythonhosted.org \
  pypi.org \
  pypi.python.org \
  github.com \
  codeload.github.com \
  raw.githubusercontent.com \
  objects.githubusercontent.com \
  registry-1.docker.io \
  fonts.googleapis.com \
  fonts.gstatic.com \
  deb.debian.org \
  security.ubuntu.com \
  archive.ubuntu.com

acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl Safe_ports port 8080
acl CONNECT method CONNECT

http_access allow doable_allow
http_access deny CONNECT !SSL_ports
http_access deny !Safe_ports
http_access deny all

# Cache settings — minimal so build artefacts stay fresh.
cache deny all
access_log /var/log/squid/access.log squid
EOF

# 3. Enable + restart squid so changes take effect
systemctl enable --now squid
systemctl restart squid

# 4. User-facing summary
cat <<'EOF'
─────────────────────────────────────────────────────────────
Squid installed and configured with a build-time allow-list.
To route Doable builds through it, add to /root/doable/.env:
    BUILD_HTTP_PROXY=http://127.0.0.1:3128
Edit /etc/squid/conf.d/doable-allowlist.conf to extend the
allow-list (then `systemctl restart squid`).
Tail allow/deny decisions: tail -f /var/log/squid/access.log
─────────────────────────────────────────────────────────────
EOF
