#!/usr/bin/env python3
import subprocess
import os
import time

# SSH details
key_path = os.path.expanduser("~/Documents/itdept")
host = "root@dodev.fid.pw"

# Commands to execute
commands = """
cd /root/doable

# Update web environment
mkdir -p apps/web
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://api.dev.doable.me
NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me
NEXT_PUBLIC_APP_URL=https://dev.doable.me
EOF

echo "Web .env.local updated"

# Run migrations
cd services/api
npm run db:migrate 2>&1 | tail -5
cd /root/doable

# Restart services
echo "Restarting doable service..."
systemctl restart doable || systemctl start doable

# Wait
sleep 5

# Check status
echo "Checking service status..."
ps aux | grep -E "node|npm" | grep -v grep | wc -l

# Try to reach API
curl -s http://localhost:4000/health 2>&1 | head -20 || echo "API warming up..."
"""

try:
    # Execute via SSH
    result = subprocess.run(
        ["ssh", "-i", key_path, host, commands],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    print("=== STDOUT ===")
    print(result.stdout)
    
    if result.stderr:
        print("\n=== STDERR ===")
        print(result.stderr)
    
    print(f"\n=== EXIT CODE: {result.returncode} ===")
    
except subprocess.TimeoutExpired:
    print("SSH command timed out - services may still be starting")
except Exception as e:
    print(f"Error: {e}")
