#!/bin/bash
# Fix dev server configuration
set -e

cd /root/doable

echo "Setting up environment files for dev.doable.me..."

# Ensure .env has proper values if not already set
if [ ! -f .env ]; then
  echo "ERROR: .env does not exist!"
  exit 1
fi

# Create proper .env.local for web app if it doesn't exist
if [ ! -f apps/web/.env.local ]; then
  cat > apps/web/.env.local << 'EOF'
# Frontend environment - dev server
NEXT_PUBLIC_API_URL=https://api.dev.doable.me
NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me
NEXT_PUBLIC_APP_URL=https://dev.doable.me
EOF
  echo "✓ Created apps/web/.env.local"
else
  echo "✓ apps/web/.env.local already exists"
fi

# Ensure database is accessible and migrations are applied
echo ""
echo "Running database migrations..."
cd services/api
npm run db:migrate || true
cd ../..

# Ensure services are running in tmux
echo ""
echo "Checking tmux session 'doable'..."
if ! tmux has-session -t doable 2>/dev/null; then
  echo "Creating tmux session 'doable'..."
  tmux new-session -d -s doable -x 200 -y 50
  tmux new-window -t doable:1 -n api "cd /root/doable/services/api && npm run dev"
  tmux new-window -t doable:2 -n web "cd /root/doable/apps/web && npm run start -- -H 127.0.0.1"
  tmux new-window -t doable:3 -n ws "cd /root/doable/services/ws && npm run dev"
  echo "✓ Created tmux session with api, web, ws windows"
  sleep 3
else
  echo "✓ tmux session 'doable' already exists"
  tmux list-windows -t doable
fi

echo ""
echo "Verifying services..."
sleep 2

if curl -s http://localhost:4000/health >/dev/null 2>&1; then
  echo "✓ API server (port 4000) responding"
else
  echo "⚠ API server (port 4000) not responding yet"
fi

if curl -s http://localhost:3000 >/dev/null 2>&1; then
  echo "✓ Web server (port 3000) responding"
else
  echo "⚠ Web server (port 3000) not responding yet"
fi

echo ""
echo "Done! Services configured for dev.doable.me"
echo "If services didn't start, run:"
echo "  systemctl restart doable"
