// WebSocket QA test suite for dev-ws.doable.me
import { WebSocket } from 'ws';

const WS_BASE = 'wss://dev-ws.doable.me';
const VALID_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJlbWFpbCI6ICJvd25lci1wcm9AZG9hYmxlLm1lIiwgInN1YiI6ICI3YjM2ZjJlNy02NWJiLTQ3MDAtYTY4YS04MjMzYzA2ZmFiOTIiLCAiaXNzIjogImRvYWJsZSIsICJpYXQiOiAxNzc4NzgwOTI3LCAiZXhwIjogMTc3ODc5NTMyN30.84XqqfpehW-MeOWJmPGnzP4n6VDoLkYvPoDDUrOd5Cg';
const MEMBER_TOKEN = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJlbWFpbCI6ICJ3cy1tZW1iZXJAZG9hYmxlLm1lIiwgInN1YiI6ICI1NjE5ZWI0Yi00MWVmLTRjNzUtYmNjZC1hNmYzZTVkMGE4NzciLCAiaXNzIjogImRvYWJsZSIsICJpYXQiOiAxNzc4NzgwOTI3LCAiZXhwIjogMTc3ODc5NTMyN30.2BZh-AZmKl3FDYpaGuaoad-tXn5zYt5ideRobIAg4Xo';
const PROJ_ID = 'a9bcb1a9-20ea-4ad5-a4e3-1ed9662284ac';

const results = [];

function connect(token, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const url = token ? `${WS_BASE}/?token=${token}` : WS_BASE;
    const ws = new WebSocket(url);
    const msgs = [];
    let closeCode = null, closeReason = null;

    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ws, msgs, closeCode, closeReason, timedOut: true });
    }, timeout);

    ws.on('open', () => {});
    ws.on('message', (data) => { msgs.push(JSON.parse(data.toString())); });
    ws.on('close', (code, reason) => {
      closeCode = code;
      closeReason = reason.toString();
      clearTimeout(timer);
      resolve({ ws, msgs, closeCode, closeReason, timedOut: false });
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ws, msgs, closeCode, closeReason, timedOut: false, error: err.message });
    });
  });
}

function connectAndWait(token, waitMs = 3000) {
  return new Promise((resolve) => {
    const url = token ? `${WS_BASE}/?token=${token}` : WS_BASE;
    const ws = new WebSocket(url);
    const msgs = [];
    let closeCode = null, closeReason = null, closed = false;

    const done = () => resolve({ ws, msgs, closeCode, closeReason, closed });

    setTimeout(done, waitMs);

    ws.on('message', (data) => { msgs.push(JSON.parse(data.toString())); });
    ws.on('close', (code, reason) => {
      closeCode = code; closeReason = reason.toString(); closed = true; done();
    });
    ws.on('error', (err) => { resolve({ ws, msgs, closeCode, closeReason, closed, error: err.message }); });
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function waitMsg(ws, type, timeout = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) { clearTimeout(timer); resolve(msg); }
    });
  });
}

function record(id, desc, pass, expected, actual) {
  results.push({ id, desc, pass, expected, actual });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} | ${desc}`);
  if (!pass) console.log(`       expected: ${expected} | actual: ${JSON.stringify(actual)}`);
}

// TC-WS-AUTH-001: Connect with valid JWT -> connected message
async function test001() {
  const { ws, msgs, closeCode, timedOut } = await connectAndWait(VALID_TOKEN, 2000);
  const connected = msgs.find(m => m.type === 'connected');
  const pass = !!connected && connected.userId;
  record('TC-WS-AUTH-001', 'Valid JWT -> connected message', pass,
    '{type:"connected",userId}', connected || { closeCode, timedOut });
  if (ws.readyState === WebSocket.OPEN) ws.close();
  return connected;
}

// TC-WS-AUTH-002: No token -> close 4001
async function test002() {
  const { closeCode, closeReason } = await connect(null);
  const pass = closeCode === 4001;
  record('TC-WS-AUTH-002', 'No token -> close 4001', pass, '4001 Missing token', { closeCode, closeReason });
}

// TC-WS-AUTH-003: Empty token -> close 4001
async function test003() {
  const { closeCode, closeReason } = await connect('');
  const pass = closeCode === 4001;
  record('TC-WS-AUTH-003', 'Empty token -> close 4001', pass, '4001', { closeCode, closeReason });
}

// TC-WS-AUTH-005: Garbage token -> close 4002
async function test005() {
  const { closeCode, closeReason } = await connect('garbage_token_abc');
  const pass = closeCode === 4002;
  record('TC-WS-AUTH-005', 'Garbage token -> close 4002', pass, '4002', { closeCode, closeReason });
}

// TC-WS-AUTH-030: Heartbeat -> heartbeat_ack
async function test030() {
  const url = `${WS_BASE}/?token=${VALID_TOKEN}`;
  const ws = new WebSocket(url);

  const result = await new Promise((resolve) => {
    let connected = false;
    const msgs = [];
    const timer = setTimeout(() => { ws.terminate(); resolve({ msgs, timedOut: true }); }, 5000);

    ws.on('open', () => {});
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs.push(msg);
      if (msg.type === 'connected' && !connected) {
        connected = true;
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
      if (msg.type === 'heartbeat_ack') {
        clearTimeout(timer);
        ws.close();
        resolve({ msgs, timedOut: false });
      }
    });
    ws.on('close', () => { clearTimeout(timer); resolve({ msgs, timedOut: false }); });
    ws.on('error', (err) => { clearTimeout(timer); resolve({ msgs, error: err.message }); });
  });

  const ack = result.msgs.find(m => m.type === 'heartbeat_ack');
  record('TC-WS-AUTH-030', 'Heartbeat -> heartbeat_ack', !!ack, 'heartbeat_ack', result.msgs.map(m=>m.type));
}

// TC-WS-ROOM-001: Join room with valid projectId -> room:joined
async function testRoom001() {
  const url = `${WS_BASE}/?token=${VALID_TOKEN}`;
  const ws = new WebSocket(url);

  const result = await new Promise((resolve) => {
    let phase = 'connecting';
    const msgs = [];
    const timer = setTimeout(() => { ws.terminate(); resolve({ msgs, timedOut: true }); }, 6000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs.push(msg);
      if (msg.type === 'connected' && phase === 'connecting') {
        phase = 'joining';
        ws.send(JSON.stringify({ type: 'room:join', projectId: PROJ_ID }));
      }
      if (msg.type === 'room:joined' || msg.type === 'error') {
        clearTimeout(timer);
        ws.close();
        resolve({ msgs, timedOut: false });
      }
    });
    ws.on('close', () => { clearTimeout(timer); resolve({ msgs, timedOut: false }); });
    ws.on('error', (err) => { clearTimeout(timer); resolve({ msgs, error: err.message }); });
  });

  const joined = result.msgs.find(m => m.type === 'room:joined');
  const err = result.msgs.find(m => m.type === 'error');
  record('TC-WS-ROOM-001', 'Join room -> room:joined', !!joined, 'room:joined',
    joined || err || { timedOut: result.timedOut, types: result.msgs.map(m=>m.type) });
  return { joined, ws: null };
}

// TC-WS-ROOM-032: Malformed JSON -> PARSE_ERROR, connection stays open
async function testRoom032() {
  const url = `${WS_BASE}/?token=${VALID_TOKEN}`;
  const ws = new WebSocket(url);

  const result = await new Promise((resolve) => {
    let phase = 'connecting';
    const msgs = [];
    const timer = setTimeout(() => { ws.close(); resolve({ msgs, timedOut: true }); }, 6000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs.push(msg);
      if (msg.type === 'connected' && phase === 'connecting') {
        phase = 'sent-bad';
        ws.send('not valid json {{{');
      }
      if (msg.type === 'error' && phase === 'sent-bad') {
        // Check connection still open by sending heartbeat
        phase = 'checking-open';
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
      if (msg.type === 'heartbeat_ack') {
        clearTimeout(timer);
        ws.close();
        resolve({ msgs, timedOut: false, stayedOpen: true });
      }
    });
    ws.on('close', () => { clearTimeout(timer); resolve({ msgs, timedOut: false, stayedOpen: false }); });
    ws.on('error', (err) => { clearTimeout(timer); resolve({ msgs, error: err.message }); });
  });

  const parseErr = result.msgs.find(m => m.type === 'error' && (m.code === 'PARSE_ERROR' || m.message?.includes('JSON')));
  const pass = !!parseErr && result.stayedOpen;
  record('TC-WS-ROOM-032', 'Malformed JSON -> PARSE_ERROR, conn stays open', pass,
    'error PARSE_ERROR + connection stays open',
    { parseErr, stayedOpen: result.stayedOpen, types: result.msgs.map(m=>m.type) });
}

// TC-WS-AUTH-037: GET /internal/presence/:id - no auth required (security gap)
async function testPresence037() {
  const resp = await fetch(`https://dev-ws.doable.me/internal/presence/${PROJ_ID}`);
  const body = await resp.json();
  const noAuth = resp.status === 200;
  record('TC-WS-AUTH-037', 'GET /internal/presence no auth (security gap check)',
    noAuth, // PASS means gap exists (unauthenticated access works)
    '200 without auth', { status: resp.status, body });
  if (noAuth) {
    console.log('       SECURITY GAP: /internal/presence accessible without auth');
  }
}

// TC-WS-ROOM-MEMBERSHIP: Join foreign project (ws-member joining owner-pro project)
async function testMembership() {
  // ws-member token trying to join a project owned by owner-pro workspace
  const url = `${WS_BASE}/?token=${MEMBER_TOKEN}`;
  const ws = new WebSocket(url);

  const result = await new Promise((resolve) => {
    let phase = 'connecting';
    const msgs = [];
    const timer = setTimeout(() => { ws.terminate(); resolve({ msgs, timedOut: true }); }, 6000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs.push(msg);
      if (msg.type === 'connected' && phase === 'connecting') {
        phase = 'joining';
        ws.send(JSON.stringify({ type: 'room:join', projectId: PROJ_ID }));
      }
      if ((msg.type === 'room:joined' || msg.type === 'error') && phase === 'joining') {
        clearTimeout(timer);
        ws.close();
        resolve({ msgs, timedOut: false });
      }
    });
    ws.on('close', () => { clearTimeout(timer); resolve({ msgs, timedOut: false }); });
    ws.on('error', (err) => { clearTimeout(timer); resolve({ msgs, error: err.message }); });
  });

  const joined = result.msgs.find(m => m.type === 'room:joined');
  const forbidden = result.msgs.find(m => m.type === 'error' && (m.code === 'FORBIDDEN_ROOM' || m.code?.includes('FORBIDDEN')));
  // ws-member should NOT be able to join owner-pro's project
  const pass = !!forbidden && !joined;
  record('TC-WS-ROOM-MEMBERSHIP-001', 'Non-member join foreign project -> FORBIDDEN_ROOM', pass,
    'error FORBIDDEN_ROOM', { joined: !!joined, forbidden: !!forbidden, types: result.msgs.map(m=>m.type) });
}

// TC-WS-CURSOR: cursor:move broadcast (two connections same project)
async function testCursor() {
  // Open two connections as owner-pro, join same room, send cursor from conn1, check conn2 receives
  const open = (tok) => new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/?token=${tok}`);
    ws.on('open', () => {});
    ws.on('error', () => {});
    resolve(ws);
  });

  const ws1 = await open(VALID_TOKEN);
  const ws2 = await open(VALID_TOKEN);

  const result = await new Promise((resolve) => {
    const msgs1 = [], msgs2 = [];
    let joined1 = false, joined2 = false;
    let cursorReceived = null;
    const timer = setTimeout(() => { ws1.terminate(); ws2.terminate(); resolve({ msgs1, msgs2, cursorReceived, timedOut: true }); }, 8000);

    const tryJoin = () => {
      if (joined1 && joined2) {
        // Both joined, send cursor from ws1
        setTimeout(() => {
          ws1.send(JSON.stringify({ type: 'cursor:move', x: 42, y: 99, fileId: 'test.ts' }));
        }, 200);
      }
    };

    ws1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs1.push(msg);
      if (msg.type === 'connected') ws1.send(JSON.stringify({ type: 'room:join', projectId: PROJ_ID }));
      if (msg.type === 'room:joined') { joined1 = true; tryJoin(); }
    });

    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgs2.push(msg);
      if (msg.type === 'connected') ws2.send(JSON.stringify({ type: 'room:join', projectId: PROJ_ID }));
      if (msg.type === 'room:joined') { joined2 = true; tryJoin(); }
      if (msg.type === 'cursor:move' || msg.type === 'cursor:update') {
        cursorReceived = msg;
        clearTimeout(timer);
        ws1.close(); ws2.close();
        resolve({ msgs1, msgs2, cursorReceived, timedOut: false });
      }
    });

    ws1.on('close', () => {});
    ws2.on('close', () => { clearTimeout(timer); resolve({ msgs1, msgs2, cursorReceived, timedOut: false }); });
    ws1.on('error', () => {}); ws2.on('error', () => {});
  });

  const pass = !!result.cursorReceived;
  record('TC-WS-MSG-CURSOR-001', 'cursor:move from ws1 received by ws2', pass,
    'cursor:move/update on ws2', { received: result.cursorReceived, timedOut: result.timedOut });
}

// Run all tests
async function main() {
  console.log('=== WebSocket QA Tests ===\n');
  await test001();
  await test002();
  await test003();
  await test005();
  await test030();
  await testRoom001();
  await testRoom032();
  await testPresence037();
  await testMembership();
  await testCursor();

  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);

  // Write results
  import('fs').then(fs => {
    fs.writeFileSync(
      'C:\\Users\\gj\\Documents\\workspace\\doable\\testcases\\evidence\\dev\\batch-2026-05-14\\editor-ws-results.json',
      JSON.stringify({ timestamp: new Date().toISOString(), wsTests: results }, null, 2)
    );
    console.log('\nResults written to editor-ws-results.json');
  });
}

main().catch(console.error);
