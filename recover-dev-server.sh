#!/bin/bash
# Master fix script for Doable dev server
# Run this after: git pull && pnpm install

set -e

cd /root/doable

echo "╔════════════════════════════════════════════════════════╗"
echo "║ Doable Dev Server Recovery & Setup                    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Fix environment files
echo "[1/5] Setting up environment files..."
cat > apps/web/.env.local << 'EOF'
# Frontend environment - dev server behind Cloudflare tunnel
NEXT_PUBLIC_API_URL=https://api.dev.doable.me
NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me
NEXT_PUBLIC_APP_URL=https://dev.doable.me
EOF
echo "✓ Created apps/web/.env.local"

# Verify root .env exists
if [ ! -f .env ]; then
  echo "⚠ WARNING: Root .env file missing! Services will not start."
  echo "  Please run: ssh root@dodev.fid.pw 'cat > /root/doable/.env << EOF'"
  echo "  Then paste the environment variables."
  exit 1
fi
echo "✓ Root .env file exists"

# Step 2: Run database migrations
echo ""
echo "[2/5] Running database migrations..."
cd services/api
npm run db:migrate 2>&1 | tail -10
cd /root/doable
echo ""

# Step 3: Kill existing processes and services
echo "[3/5] Stopping existing services..."
systemctl stop doable 2>/dev/null || true
sleep 2
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "npm run start" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
sleep 2
echo "✓ Services stopped"

# Step 4: Create/restore tmux session
echo ""
echo "[4/5] Setting up tmux session..."
if tmux has-session -t doable 2>/dev/null; then
  tmux kill-session -t doable
  echo "✓ Killed existing tmux session"
fi

tmux new-session -d -s doable -x 240 -y 60
sleep 1

# Window 1: API
tmux new-window -t doable:1 -n api
tmux send-keys -t doable:1 "cd /root/doable/services/api && npm run dev" Enter
sleep 3

# Window 2: Web
tmux new-window -t doable:2 -n web
tmux send-keys -t doable:2 "cd /root/doable/apps/web && npm run start -- -H 127.0.0.1" Enter
sleep 3

# Window 3: WS
tmux new-window -t doable:3 -n ws
tmux send-keys -t doable:3 "cd /root/doable/services/ws && npm run dev" Enter
sleep 2

echo "✓ Created tmux session 'doable' with 3 windows:"
echo "  • Window 1: api     (npm run dev)"
echo "  • Window 2: web     (npm run start)"
echo "  • Window 3: ws      (npm run dev)"
echo ""

# Step 5: Verify services
echo "[5/5] Waiting for services to start and verifying..."
sleep 5

API_OK=0
WEB_OK=0
WS_OK=0

for i in {1..10}; do
  if [ $API_OK -eq 0 ] && curl -s http://localhost:4000/health >/dev/null 2>&1; then
    echo "✓ API server (4000) responding"
    API_OK=1
  fi
  
  if [ $WEB_OK -eq 0 ] && curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "✓ Web server (3000) responding"
    WEB_OK=1
  fi
  
  if [ $WS_OK -eq 0 ] && nc -z localhost 4001 >/dev/null 2>&1; then
    echo "✓ WebSocket server (4001) listening"
    WS_OK=1
  fi
  
  if [ $API_OK -eq 1 ] && [ $WEB_OK -eq 1 ] && [ $WS_OK -eq 1 ]; then
    break
  fi
  
  if [ $i -lt 10 ]; then
    echo "  Waiting... (attempt $i/10)"
    sleep 3
  fi
done

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║ Setup Complete!                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Services should now be accessible via:"
echo "  • https://dev.doable.me (frontend)"
echo "  • https://api.dev.doable.me (API - via tunnel)"
echo ""
echo "To monitor tmux:"
echo "  tmux attach-session -t doable"
echo ""
echo "To view logs:"
echo "  tmux capture-pane -t doable:1 -p  # API logs"
echo "  tmux capture-pane -t doable:2 -p  # Web logs"
echo "  tmux capture-pane -t doable:3 -p  # WS logs"
echo ""
