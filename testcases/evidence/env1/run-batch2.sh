#!/usr/bin/env bash
set -u
TOKFILE="C:/Users/gj/Documents/workspace/doable/testcases/evidence/_tokens-env1.json"
RUNLOG="C:/Users/gj/Documents/workspace/doable/testcases/99-runlog/<env>/RUN-2026-05-10-WS-INTEG.md"
EVID="C:/Users/gj/Documents/workspace/doable/testcases/evidence/<env>"
WSDIR="/c/Users/gj/Documents/workspace/doable/services/ws"
API="https://<env>-api.doable.me"
WSURL="wss://<env>-ws.doable.me"
OWNER=$(python -c "import json; print(json.load(open(r'$TOKFILE'))['qa-owner']['access'])")
ALICE=$(python -c "import json; print(json.load(open(r'$TOKFILE'))['qa-alice']['access'])")

row() { local now=$(date -u +%FT%TZ); printf "| %s | %s | %s | %s |\n" "$1" "$now" "$2" "$3" >> "$RUNLOG"; }

cd "$WSDIR"

echo ">>> WS-AUTH-002 no token"
node -e 'import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/");w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});w.on("error",e=>{console.log("ERR",e.message)});setTimeout(()=>{console.log("TIMEOUT");process.exit(2)},4000)})' > "$EVID/TC-WS-AUTH-002.log" 2>&1
cat "$EVID/TC-WS-AUTH-002.log"
grep -q "CLOSE 4001" "$EVID/TC-WS-AUTH-002.log" && row TC-WS-AUTH-002 PASS "close=4001 missing" || row TC-WS-AUTH-002 FAIL "$(head -c 120 $EVID/TC-WS-AUTH-002.log)"

echo ">>> WS-AUTH-005 garbage"
node -e 'import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/?token=abc");w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});w.on("error",e=>{console.log("ERR",e.message)});setTimeout(()=>{console.log("TIMEOUT");process.exit(2)},4000)})' > "$EVID/TC-WS-AUTH-005.log" 2>&1
cat "$EVID/TC-WS-AUTH-005.log"
grep -q "CLOSE 4002" "$EVID/TC-WS-AUTH-005.log" && row TC-WS-AUTH-005 PASS "close=4002 invalid" || row TC-WS-AUTH-005 FAIL "$(head -c 120 $EVID/TC-WS-AUTH-005.log)"

echo ">>> WS-AUTH-001 valid"
T="$OWNER" node -e 'const T=process.env.T;import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/?token="+T);w.on("open",()=>console.log("OPEN"));w.on("message",d=>{console.log("MSG",d.toString().slice(0,160));w.close();process.exit(0)});w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});w.on("error",e=>{console.log("ERR",e.message)});setTimeout(()=>{console.log("TIMEOUT");process.exit(2)},5000)})' > "$EVID/TC-WS-AUTH-001.log" 2>&1
cat "$EVID/TC-WS-AUTH-001.log"
grep -q "OPEN" "$EVID/TC-WS-AUTH-001.log" && row TC-WS-AUTH-001 PASS "OPEN+welcome" || row TC-WS-AUTH-001 FAIL "$(head -c 160 $EVID/TC-WS-AUTH-001.log)"

echo ">>> WS-AUTH-003 empty"
node -e 'import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/?token=");w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});w.on("error",e=>{console.log("ERR",e.message)});setTimeout(()=>{console.log("TIMEOUT");process.exit(2)},4000)})' > "$EVID/TC-WS-AUTH-003.log" 2>&1
cat "$EVID/TC-WS-AUTH-003.log"
grep -q "CLOSE 4001" "$EVID/TC-WS-AUTH-003.log" && row TC-WS-AUTH-003 PASS "close=4001" || row TC-WS-AUTH-003 FAIL "$(head -c 120 $EVID/TC-WS-AUTH-003.log)"

echo ">>> WS-AUTH-006 expired"
EXP_TOK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImV4cEBkb2FibGUudGVzdCIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImlzcyI6ImRvYWJsZSIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAwfQ.zzzzzz"
node -e "import('ws').then(m=>{const w=new m.WebSocket('wss://<env>-ws.doable.me/?token=$EXP_TOK');w.on('close',(c,r)=>{console.log('CLOSE',c,r.toString());process.exit(0)});w.on('error',e=>{console.log('ERR',e.message)});setTimeout(()=>{console.log('TIMEOUT');process.exit(2)},4000)})" > "$EVID/TC-WS-AUTH-006.log" 2>&1
cat "$EVID/TC-WS-AUTH-006.log"
grep -q "CLOSE 4002" "$EVID/TC-WS-AUTH-006.log" && row TC-WS-AUTH-006 PASS "close=4002 expired" || row TC-WS-AUTH-006 FAIL "$(head -c 120 $EVID/TC-WS-AUTH-006.log)"

echo ">>> WS-AUTH-033 internal/broadcast no secret"
curl -sS -o /tmp/ib -w "%{http_code}\n" -X POST "https://<env>-ws.doable.me/internal/broadcast" -H "Content-Type: application/json" -d '{}' > /tmp/c
cat /tmp/c
H=$(cat /tmp/c); { [ "$H" = "403" ] || [ "$H" = "401" ]; } && row TC-WS-AUTH-033 PASS "got $H" || row TC-WS-AUTH-033 FAIL "got $H"

echo ">>> WS-MESSAGES heartbeat"
T="$OWNER" node -e 'const T=process.env.T;import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/?token="+T);w.on("open",()=>{w.send(JSON.stringify({type:"room.join",roomId:"hb:test"}));setTimeout(()=>w.send(JSON.stringify({type:"heartbeat"})),300)});w.on("message",d=>{const s=d.toString();console.log("MSG",s.slice(0,150));if(s.includes("heartbeat_ack")){w.close();process.exit(0)}});w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});setTimeout(()=>{console.log("TIMEOUT");process.exit(0)},5000)})' > "$EVID/TC-WS-MSG.log" 2>&1
cat "$EVID/TC-WS-MSG.log"
grep -q "heartbeat_ack" "$EVID/TC-WS-MSG.log" && row TC-WS-MSG-HB PASS "heartbeat_ack" || row TC-WS-MSG-HB FAIL "$(head -c 160 $EVID/TC-WS-MSG.log)"

echo ">>> WS-ROOMS join"
T="$OWNER" node -e 'const T=process.env.T;import("ws").then(m=>{const w=new m.WebSocket("wss://<env>-ws.doable.me/?token="+T);let got=[];w.on("open",()=>{w.send(JSON.stringify({type:"room.join",roomId:"r:<env>"}))});w.on("message",d=>{const s=d.toString();got.push(s.slice(0,200));console.log("MSG",s.slice(0,160));if(got.length>=2){w.close();process.exit(0)}});w.on("close",(c,r)=>{console.log("CLOSE",c,r.toString());process.exit(0)});setTimeout(()=>{console.log("TIMEOUT got=",got.length);process.exit(0)},5000)})' > "$EVID/TC-WS-ROOMS.log" 2>&1
cat "$EVID/TC-WS-ROOMS.log"
grep -qE "room|presence|MSG" "$EVID/TC-WS-ROOMS.log" && row TC-WS-ROOMS-001 PASS "$(head -c 160 $EVID/TC-WS-ROOMS.log)" || row TC-WS-ROOMS-001 FAIL "$(head -c 160 $EVID/TC-WS-ROOMS.log)"

# Integrations
echo ">>> INTEG catalog"
curl -sS -o "$EVID/integ-cat.json" -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$API/integrations/catalog" > /tmp/c
cat /tmp/c; head -c 200 "$EVID/integ-cat.json"; echo
H=$(cat /tmp/c); [ "$H" = "200" ] && row TC-INTEG-LIST-001 PASS "200 catalog" || row TC-INTEG-LIST-001 FAIL "got $H"

curl -sS -o /tmp/y -w "%{http_code}\n" "$API/integrations/catalog" > /tmp/c
cat /tmp/c
H=$(cat /tmp/c); { [ "$H" = "401" ] || [ "$H" = "403" ]; } && row TC-INTEG-LIST-038 PASS "anon=$H" || row TC-INTEG-LIST-038 FAIL "anon=$H"

WS_ID=$(python -c "import json; d=json.load(open(r'$EVID/projects.json')); arr=d.get('data',[]); print(arr[0]['workspace_id'] if arr else '')")
curl -sS -o "$EVID/integ-conn.json" -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$API/integrations/connections?workspaceId=$WS_ID" > /tmp/c
cat /tmp/c; head -c 200 "$EVID/integ-conn.json"; echo
H=$(cat /tmp/c); [ "$H" = "200" ] && row TC-INTEG-LIST-026 PASS "200 connections" || row TC-INTEG-LIST-026 FAIL "got $H"

curl -sS -o /tmp/y -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$API/integrations/catalog/__nope__" > /tmp/c
cat /tmp/c
H=$(cat /tmp/c); [ "$H" = "404" ] && row TC-INTEG-LIST-040 PASS "404" || row TC-INTEG-LIST-040 FAIL "got $H"

# Comments
PROJ=$(python -c "import json; d=json.load(open(r'$EVID/projects.json')); arr=d.get('data',[]); print(arr[0]['id'] if arr else '')")
echo "PROJ=$PROJ"
curl -sS -o "$EVID/comments.json" -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$API/design-comments/$PROJ" > /tmp/c
cat /tmp/c; head -c 200 "$EVID/comments.json"; echo
H=$(cat /tmp/c); [ "$H" = "200" ] && row TC-COMMENTS-CRUD-001 PASS "200 list" || row TC-COMMENTS-CRUD-001 FAIL "got $H"

curl -sS -o "$EVID/comments-create.json" -w "%{http_code}\n" -X POST -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"body":"WS-INTEG smoke","selector":{"x":10,"y":20}}' "$API/design-comments/$PROJ" > /tmp/c
cat /tmp/c; head -c 200 "$EVID/comments-create.json"; echo
H=$(cat /tmp/c); { [ "$H" = "200" ] || [ "$H" = "201" ]; } && row TC-COMMENTS-CRUD-002 PASS "create $H" || row TC-COMMENTS-CRUD-002 FAIL "got $H"

# Notifications - no API endpoint exists
row TC-NOTIF-LIST-001 FAIL "no /notifications API mounted (404). file BUG-WSI-001."
row TC-NOTIF-PUSH-001 SKIP "no notifications API"
row TC-NOTIF-TYPES-001 SKIP "no notifications API"

echo "DONE"
tail -40 "$RUNLOG"
