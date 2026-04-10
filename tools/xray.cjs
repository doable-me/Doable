#!/usr/bin/env node
/**
 * X-Ray CLI — Reusable tool for monitoring integration calls.
 *
 * Usage:
 *   node tools/xray.cjs                  # show active + stuck + stats
 *   node tools/xray.cjs watch            # poll every 2s until Ctrl+C
 *   node tools/xray.cjs stats            # latency stats for all integrations
 *   node tools/xray.cjs history supabase # recent calls for an integration
 *   node tools/xray.cjs call <callId>    # single call forensics
 *   node tools/xray.cjs stuck [ms]       # stuck calls (default threshold 10000ms)
 *
 * Reads JWT_SECRET from .env automatically (looks up from repo root).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// --- Config ---
const API = "http://127.0.0.1:4000";
const USER_ID = "0ff7b403-24dd-4609-8d06-d594a6551658";
const EMAIL = "uniquegodwin@gmail.com";
const ISSUER = "doable";

// --- Find .env and read JWT_SECRET ---
function findEnv() {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

function getSecret() {
  const envPath = findEnv();
  if (envPath) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^JWT_SECRET=(.+)$/m);
    if (match) return match[1].trim();
  }
  return "change-me-to-a-64-char-random-string";
}

// --- JWT ---
function makeToken() {
  const secret = getSecret();
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: USER_ID, email: EMAIL, iss: ISSUER, iat: now, exp: now + 3600 })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(header + "." + payload)
    .digest("base64url");
  return header + "." + payload + "." + sig;
}

const TOKEN = makeToken();

// --- HTTP helper ---
async function xray(endpoint) {
  const res = await fetch(API + endpoint, {
    headers: { Authorization: "Bearer " + TOKEN },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${endpoint}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

// --- Formatters ---
function fmtMs(ms) {
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function printCall(c, indent = "") {
  const status = c.status === "success" ? "\x1b[32m✓\x1b[0m" : c.status === "error" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m⏳\x1b[0m";
  console.log(
    `${indent}${status} ${c.integrationId}/${c.actionName} — ${fmtMs(c.durationMs || Date.now() - c.startedAt)} [${c.id}]`
  );
  if (c.phases) {
    for (const p of c.phases) {
      const dur = p.durationMs ?? (Date.now() - p.startedAt);
      const bar = "█".repeat(Math.min(40, Math.ceil(dur / 25)));
      console.log(`${indent}  ${p.name.padEnd(20)} ${fmtMs(dur).padStart(7)} ${bar}`);
    }
  }
  if (c.httpCalls) {
    for (const h of c.httpCalls) {
      const dur = h.durationMs ?? (Date.now() - h.startedAt);
      console.log(
        `${indent}  → ${h.method} ${h.url.substring(0, 80)} [${h.statusCode || "..."}] ${fmtMs(dur)}`
      );
    }
  }
  if (c.error) console.log(`${indent}  \x1b[31mERR: ${c.error}\x1b[0m`);
}

// --- Commands ---
async function cmdStatus() {
  const [active, stuck, stats] = await Promise.all([
    xray("/xray/active"),
    xray("/xray/stuck?threshold=10000"),
    xray("/xray/stats"),
  ]);

  console.log("\x1b[1m=== ACTIVE CALLS ===\x1b[0m");
  const activeCalls = Array.isArray(active.data) ? active.data : Object.values(active.data || {});
  if (activeCalls.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of activeCalls) printCall(c, "  ");
  }

  console.log("\n\x1b[1m=== STUCK (>10s) ===\x1b[0m");
  const stuckCalls = Array.isArray(stuck.data) ? stuck.data : Object.values(stuck.data || {});
  if (stuckCalls.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of stuckCalls) printCall(c, "  ");
  }

  console.log("\n\x1b[1m=== INTEGRATION STATS ===\x1b[0m");
  const statsList = Array.isArray(stats.data) ? stats.data : [stats.data].filter(Boolean);
  for (const s of statsList) {
    console.log(
      `  ${s.integrationId}: ${s.totalCalls} calls, avg ${fmtMs(s.avgMs)}, ` +
        `p50 ${fmtMs(s.p50Ms)}, p95 ${fmtMs(s.p95Ms)}, max ${fmtMs(s.maxMs)}, ` +
        `${s.errorCount} errors`
    );
  }
  if (statsList.length === 0) console.log("  (no calls recorded yet)");
}

async function cmdWatch() {
  console.log("\x1b[1mX-Ray Watch Mode\x1b[0m — polling every 2s (Ctrl+C to stop)\n");
  let lastCallCount = 0;

  while (true) {
    try {
      const [active, stuck, stats] = await Promise.all([
        xray("/xray/active"),
        xray("/xray/stuck?threshold=10000"),
        xray("/xray/stats"),
      ]);

      const activeCalls = Array.isArray(active.data) ? active.data : Object.values(active.data || {});
      const stuckCalls = Array.isArray(stuck.data) ? stuck.data : Object.values(stuck.data || {});
      const statsList = Array.isArray(stats.data) ? stats.data : [stats.data].filter(Boolean);
      const totalCalls = statsList.reduce((sum, s) => sum + s.totalCalls, 0);

      // Only print when something is happening
      if (activeCalls.length > 0 || stuckCalls.length > 0 || totalCalls !== lastCallCount) {
        const ts = new Date().toLocaleTimeString();
        if (activeCalls.length > 0) {
          console.log(`\x1b[33m[${ts}] ${activeCalls.length} ACTIVE:\x1b[0m`);
          for (const c of activeCalls) printCall(c, "  ");
        }
        if (stuckCalls.length > 0) {
          console.log(`\x1b[31m[${ts}] ${stuckCalls.length} STUCK:\x1b[0m`);
          for (const c of stuckCalls) printCall(c, "  ");
        }
        if (totalCalls !== lastCallCount && totalCalls > 0) {
          const newCalls = totalCalls - lastCallCount;
          if (lastCallCount > 0) console.log(`\x1b[32m[${ts}] +${newCalls} completed\x1b[0m`);
          for (const s of statsList) {
            console.log(`  ${s.integrationId}: ${s.totalCalls} total, avg ${fmtMs(s.avgMs)}, last ${fmtTime(s.lastCallAt)}`);
          }
        }
        lastCallCount = totalCalls;
      }
    } catch (e) {
      console.error(`\x1b[31m[ERR] ${e.message}\x1b[0m`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function cmdStats() {
  const stats = await xray("/xray/stats");
  const list = Array.isArray(stats.data) ? stats.data : [stats.data].filter(Boolean);
  for (const s of list) {
    console.log(`\n\x1b[1m${s.integrationId}\x1b[0m`);
    console.log(`  Calls: ${s.totalCalls} (${s.successCount} ok, ${s.errorCount} err)`);
    console.log(`  Latency: avg ${fmtMs(s.avgMs)}, p50 ${fmtMs(s.p50Ms)}, p95 ${fmtMs(s.p95Ms)}, p99 ${fmtMs(s.p99Ms)}, max ${fmtMs(s.maxMs)}`);
    if (s.lastError) console.log(`  \x1b[31mLast error: ${s.lastError} at ${fmtTime(s.lastErrorAt)}\x1b[0m`);
    if (s.slowestHttp?.length) {
      console.log("  Slowest HTTP:");
      for (const h of s.slowestHttp.slice(0, 5)) {
        console.log(`    ${h.method} ${h.url.substring(0, 70)} [${h.statusCode}] ${fmtMs(h.durationMs)}`);
      }
    }
    if (s.slowestPhases?.length) {
      console.log("  Slowest Phases:");
      for (const p of s.slowestPhases.slice(0, 5)) {
        console.log(`    ${p.phase.padEnd(20)} ${fmtMs(p.durationMs)} (${p.actionName})`);
      }
    }
  }
  if (list.length === 0) console.log("(no calls recorded yet)");
}

async function cmdHistory(integrationId) {
  const res = await xray(`/xray/history/${integrationId}`);
  const calls = Array.isArray(res.data) ? res.data : [res.data].filter(Boolean);
  console.log(`\x1b[1m${integrationId} — ${calls.length} recent calls\x1b[0m\n`);
  for (const c of calls) {
    printCall(c);
    console.log();
  }
  if (calls.length === 0) console.log("(no history)");
}

async function cmdCall(callId) {
  const res = await xray(`/xray/call/${callId}`);
  if (!res.data) {
    console.log("Call not found:", callId);
    return;
  }
  console.log(`\x1b[1mCall Detail: ${callId}\x1b[0m\n`);
  printCall(res.data);
  if (res.data.httpCalls?.length) {
    console.log("\n  HTTP Details:");
    for (const h of res.data.httpCalls) {
      console.log(`  #${h.seq} ${h.method} ${h.url}`);
      console.log(`    Status: ${h.statusCode}, Duration: ${fmtMs(h.durationMs)}`);
      if (h.requestBody) console.log(`    Req: ${h.requestBody.substring(0, 200)}`);
      if (h.responseBody) console.log(`    Res: ${h.responseBody.substring(0, 200)}`);
    }
  }
}

async function cmdStuck(thresholdMs) {
  const res = await xray(`/xray/stuck?threshold=${thresholdMs}`);
  const calls = Array.isArray(res.data) ? res.data : Object.values(res.data || {});
  console.log(`\x1b[1mStuck calls (>${fmtMs(thresholdMs)})\x1b[0m\n`);
  if (calls.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of calls) printCall(c, "  ");
  }
}

// --- Main ---
async function main() {
  const [cmd, arg] = process.argv.slice(2);

  try {
    switch (cmd) {
      case "watch":
        await cmdWatch();
        break;
      case "stats":
        await cmdStats();
        break;
      case "history":
        if (!arg) { console.error("Usage: xray.cjs history <integrationId>"); process.exit(1); }
        await cmdHistory(arg);
        break;
      case "call":
        if (!arg) { console.error("Usage: xray.cjs call <callId>"); process.exit(1); }
        await cmdCall(arg);
        break;
      case "stuck":
        await cmdStuck(parseInt(arg) || 10000);
        break;
      default:
        await cmdStatus();
    }
  } catch (e) {
    console.error(`\x1b[31mError: ${e.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
