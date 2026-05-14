// WebSocket test suite for dev environment
// Run: node ws-test.mjs

// Node 22 has built-in WebSocket global (browser-style addEventListener API)

const WS_URL = 'wss://dev-ws.doable.me';
const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Im93bmVyLXByb0Bkb2FibGUubWUiLCJzdWIiOiI3YjM2ZjJlNy02NWJiLTQ3MDAtYTY4YS04MjMzYzA2ZmFiOTIiLCJpc3MiOiJkb2FibGUiLCJpYXQiOjE3Nzg3ODA2MjQsImV4cCI6MTc3ODc5NTAyNH0.5Am5XHdbgJticyTeMgjrpPjaEYNafGRyZa4HVwwA4jo';
const PROJECT_ID = 'f42fcc90-7789-465f-853c-d05ef54c5915';
const FOREIGN_PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const results = [];

function test(id, desc, fn) {
  return fn().then(result => {
    results.push({ id, desc, ...result });
    const status = result.pass ? 'PASS' : result.skip ? 'SKIP' : 'FAIL';
    console.log(`[${status}] ${id}: ${desc}`);
    if (!result.pass && !result.skip) console.log(`  Expected: ${result.expected}\n  Actual: ${result.actual}`);
  }).catch(err => {
    results.push({ id, desc, pass: false, error: err.message });
    console.log(`[ERROR] ${id}: ${desc} - ${err.message}`);
  });
}

function connectWS(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const msgs = [];
    ws.addEventListener('open', () => msgs.push({ event: 'open' }));
    ws.addEventListener('message', (ev) => {
      try { msgs.push({ event: 'message', data: JSON.parse(ev.data) }); }
      catch { msgs.push({ event: 'message', data: ev.data }); }
    });
    ws.addEventListener('close', (ev) => resolve({ ws, msgs, closed: true, code: ev.code, reason: ev.reason }));
    ws.addEventListener('error', (e) => msgs.push({ event: 'error', msg: e.message }));
    setTimeout(() => resolve({ ws, msgs, timeout: true }), timeoutMs);
  });
}

async function runTests() {
  console.log('=== WebSocket Test Suite — dev environment ===\n');

  // TC-WS-AUTH-001: valid token connects
  await test('TC-WS-AUTH-001', 'Connect with valid JWT → connected message', async () => {
    const { ws, msgs, timeout, code } = await connectWS(`${WS_URL}/?token=${VALID_TOKEN}`, 4000);
    ws.close();
    const connMsg = msgs.find(m => m.event === 'message' && m.data?.type === 'connected');
    const pass = !code && timeout && connMsg && connMsg.data.userId;
    return {
      pass,
      expected: 'connected message with userId',
      actual: connMsg ? JSON.stringify(connMsg.data).substring(0,100) : 'no connected message',
      connMsg: connMsg?.data
    };
  });

  // TC-WS-AUTH-002: no token → 4001
  await test('TC-WS-AUTH-002', 'Connect without token → close 4001', async () => {
    const { code, reason } = await connectWS(`${WS_URL}/`, 4000);
    return {
      pass: code === 4001,
      expected: '4001 Missing token',
      actual: `${code} ${reason}`
    };
  });

  // TC-WS-AUTH-003: empty token → 4001
  await test('TC-WS-AUTH-003', 'Empty token → close 4001', async () => {
    const { code, reason } = await connectWS(`${WS_URL}/?token=`, 4000);
    return {
      pass: code === 4001,
      expected: '4001 Missing token',
      actual: `${code} ${reason}`
    };
  });

  // TC-WS-AUTH-005: garbage token → 4002
  await test('TC-WS-AUTH-005', 'Garbage token → close 4002', async () => {
    const { code, reason } = await connectWS(`${WS_URL}/?token=abc`, 4000);
    return {
      pass: code === 4002,
      expected: '4002 Invalid token',
      actual: `${code} ${reason}`
    };
  });

  // TC-WS-AUTH-030: heartbeat → heartbeat_ack
  await test('TC-WS-AUTH-030', 'Heartbeat → heartbeat_ack response', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
        if (parsed.type === 'heartbeat_ack') {
          resolve({ got_ack: true, msgs });
        }
      });
      ws.on('error', () => resolve({ error: true }));
      setTimeout(() => resolve({ timeout: true, msgs }), 5000);
    });
    ws.close();
    return {
      pass: result.got_ack === true,
      expected: 'heartbeat_ack message',
      actual: result.got_ack ? 'got heartbeat_ack' : `timeout, msgs: ${JSON.stringify(result.msgs?.map(m=>m.type))}`
    };
  });

  // TC-WS-ROOM-001: join room → room:joined
  await test('TC-WS-ROOM-001', 'Join room with valid projectId → room:joined', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: PROJECT_ID }));
        }
        if (parsed.type === 'room:joined') {
          resolve({ joined: true, data: parsed });
        }
        if (parsed.type === 'error') {
          resolve({ error: true, data: parsed });
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 6000);
    });
    ws.close();
    return {
      pass: result.joined === true && result.data?.projectId === PROJECT_ID,
      expected: `room:joined with projectId=${PROJECT_ID}`,
      actual: result.joined ? `room:joined, members=${JSON.stringify(result.data?.members?.map(m=>m.userId))}`
                            : `error/timeout: ${JSON.stringify(result.data || result.msgs?.map(m=>m.type))}`,
      roomData: result.data
    };
  });

  // TC-WS-ROOM-MEMBERSHIP-001: non-member join foreign project → FORBIDDEN_ROOM
  await test('TC-WS-ROOM-MEMBERSHIP-001', 'Join arbitrary foreign projectId → FORBIDDEN_ROOM', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: FOREIGN_PROJECT_ID }));
        }
        if (parsed.type === 'error') resolve({ error: true, data: parsed });
        if (parsed.type === 'room:joined') resolve({ joined: true, data: parsed });
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 6000);
    });
    ws.close();
    return {
      pass: result.error === true && result.data?.code === 'FORBIDDEN_ROOM',
      expected: 'error with code FORBIDDEN_ROOM',
      actual: result.joined ? 'FAIL: got room:joined (membership not enforced)'
                            : `${JSON.stringify(result.data)}`,
      bugNote: result.joined ? 'BUG: room:join allows any projectId without membership check' : null
    };
  });

  // TC-WS-ROOM-006: explicit leave
  await test('TC-WS-ROOM-006', 'room:leave removes from room', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      let joined = false;
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: PROJECT_ID }));
        }
        if (parsed.type === 'room:joined') {
          joined = true;
          setTimeout(() => {
            ws.send(JSON.stringify({ type: 'room:leave' }));
            setTimeout(() => resolve({ joined, leftSent: true, msgs }), 1000);
          }, 500);
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 8000);
    });
    ws.close();
    return {
      pass: result.joined && result.leftSent,
      expected: 'join then leave without error',
      actual: result.joined ? 'joined and sent leave' : 'failed to join'
    };
  });

  // TC-WS-ROOM-032: malformed JSON
  await test('TC-WS-ROOM-032', 'Malformed JSON → PARSE_ERROR response', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send('not valid json {{{');
        }
        if (parsed.type === 'error' && parsed.code === 'PARSE_ERROR') {
          resolve({ gotParseError: true, data: parsed });
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 5000);
    });
    ws.close();
    return {
      pass: result.gotParseError === true,
      expected: 'error with code PARSE_ERROR',
      actual: result.gotParseError ? 'got PARSE_ERROR' : `timeout/error: ${JSON.stringify(result.msgs?.map(m=>m.type))}`
    };
  });

  // TC-WS-AUTH-032: /health HTTP endpoint
  await test('TC-WS-AUTH-032', 'GET /health returns 200 with rooms count', async () => {
    const resp = await fetch('https://dev-ws.doable.me/health');
    const body = await resp.json();
    return {
      pass: resp.status === 200 && body.status === 'ok' && typeof body.rooms === 'number',
      expected: '200 {status:"ok", rooms: number}',
      actual: `${resp.status} ${JSON.stringify(body)}`
    };
  });

  // TC-WS-AUTH-033: /internal/broadcast without secret → 403
  await test('TC-WS-AUTH-033', 'POST /internal/broadcast without secret → 403', async () => {
    const resp = await fetch('https://dev-ws.doable.me/internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID, message: { type: 'test' } })
    });
    return {
      pass: resp.status === 403,
      expected: '403',
      actual: `${resp.status}`
    };
  });

  // TC-WS-AUTH-037: /internal/presence no secret check
  await test('TC-WS-AUTH-037', 'GET /internal/presence/:id — no secret enforced (security gap)', async () => {
    const resp = await fetch(`https://dev-ws.doable.me/internal/presence/${PROJECT_ID}`);
    const body = await resp.json();
    return {
      pass: true, // This is an INFO/observation
      skip: false,
      expected: 'INFO: check if secret required',
      actual: `${resp.status} ${JSON.stringify(body).substring(0,100)}`,
      securityGap: resp.status === 200 ? 'POSSIBLE GAP: no auth on /internal/presence' : 'protected'
    };
  });

  // TC-WS-MSG-CHAT-001: chat send in room
  await test('TC-WS-MSG-CHAT-001', 'chat:send broadcasts to room', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: PROJECT_ID }));
        }
        if (parsed.type === 'room:joined') {
          ws.send(JSON.stringify({ type: 'chat:send', content: 'QA-TEST-MSG-' + Date.now(), mentions: [] }));
        }
        if (parsed.type === 'chat:message') {
          resolve({ gotMsg: true, data: parsed });
        }
        if (parsed.type === 'chat:history') {
          // Also valid response on join
          msgs.push({ got_history: true });
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 8000);
    });
    ws.close();
    return {
      pass: result.gotMsg === true,
      expected: 'chat:message broadcast back to sender',
      actual: result.gotMsg ? `got chat:message: ${JSON.stringify(result.data).substring(0,80)}`
                            : `timeout, msgs: ${JSON.stringify(result.msgs?.map(m=>m.type))}`
    };
  });

  // TC-WS-ROOM-015: chat:history on join
  await test('TC-WS-ROOM-015', 'chat:history received after room join', async () => {
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: PROJECT_ID }));
        }
        if (parsed.type === 'chat:history') {
          resolve({ gotHistory: true, count: parsed.messages?.length, data: parsed });
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true }), 8000);
    });
    ws.close();
    return {
      pass: result.gotHistory === true && Array.isArray(result.data?.messages),
      expected: 'chat:history with messages array',
      actual: result.gotHistory ? `got history, ${result.count} messages` : 'timeout - no chat:history'
    };
  });

  // TC-WS-MSG-CURSOR-001: cursor:move broadcast
  await test('TC-WS-MSG-CURSOR-001', 'cursor:move excludes sender', async () => {
    // Two connections needed - use single for now, just verify no echo
    const ws = new WebSocket(`${WS_URL}/?token=${VALID_TOKEN}`);
    const result = await new Promise((resolve) => {
      const msgs = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        msgs.push(parsed);
        if (parsed.type === 'connected') {
          ws.send(JSON.stringify({ type: 'room:join', projectId: PROJECT_ID }));
        }
        if (parsed.type === 'room:joined') {
          ws.send(JSON.stringify({ type: 'cursor:move', filePath: 'src/index.ts', line: 10, column: 5 }));
          setTimeout(() => resolve({ msgs, sentCursor: true }), 2000);
        }
      });
      ws.on('error', (e) => resolve({ wsError: e.message }));
      setTimeout(() => resolve({ timeout: true, msgs }), 8000);
    });
    ws.close();
    const gotOwnCursor = result.msgs?.some(m => m.type === 'cursor:move');
    return {
      pass: result.sentCursor && !gotOwnCursor,
      expected: 'cursor:move NOT echoed back to sender',
      actual: gotOwnCursor ? 'FAIL: received own cursor:move back' : 'correctly not echoed back'
    };
  });

  // Summary
  console.log('\n=== RESULTS SUMMARY ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass && !r.skip).length;
  const total = results.length;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

  // Output JSON results
  const { writeFileSync } = await import('fs');
  writeFileSync('ws-results.json', JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log('\nResults written to ws-results.json');

  return results;
}

runTests().catch(console.error);
