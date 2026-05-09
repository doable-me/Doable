# Per-Turn Master Verification — counter app evolution
**Project:** `c6f845d0-1c43-4897-b48d-c23fbb8e125a` (env1) · vite-react · qa-owner
**Date:** 2026-05-10 · **Total elapsed:** ~125 s SSE-time across 6 turns

For each turn: prompt sent → SSE phases timed → Chrome navigates to preview → DOM-element wait → click-test → state assertions. Both visual presence AND functional behaviour are checked, not just code-grep.

| Turn | Feature | SSE ms | edits | prompt/comp tok | TTFT ms | DOM verify | Click-test |
|------|---------|--------|-------|-----------------|---------|------------|------------|
| 1 | counter +1/−1/Reset, text-6xl | 30 109 | 2 | 61 777 / 691 | 402 | buttons=[+1,−1,Reset], counter='0' | +1×3 → 3, −1 → 2, Reset → 0 — **PASS** |
| 2 | x2 button, bg-purple | 25 069 | 1 | 64 604 / 292 | 2 950 | buttons=[+1,−1,Reset,x2] | from 0: +1+1=2 → x2 → 4 — **PASS** |
| 3 | history list (last 5) | 14 836 | 1 | 70 815 / 698 | 1 486 | history items=[4,2,1] most-recent-first | history grows on each click — **PASS** |
| 4 | localStorage persist | 15 423 | 1 | 74 754 / 810 | 2 251 | localStorage.counter='3', .history='[3,2,1]' | reload tab → counter still '3', history still ['3','2','1'] — **PASS** |
| 5 | max/min badges | 16 801 | 1 | 79 522 / 934 | 2 084 | text "max: 5" + "min: 0" | sequence +5,−3 → counter=2, max=5, min=0 — **PASS** |
| 6 | dark/light toggle | 22 264 | 1 | 85 447 / 1 276 | 4 423 | document.documentElement.classList toggles 'dark' | click1→dark=true, click2→dark=false, localStorage.theme='dark' — **PASS** |

## Cumulative feature retention across turns
After turn 6, the rendered DOM contains EVERY feature from turns 1–6 simultaneously:
- text-6xl counter ✅
- +1, −1, Reset, x2 buttons ✅
- max/min badges showing tracked extremes ✅
- last-5 history list ✅
- dark-mode toggle persisted in localStorage ✅
- counter+history persisted in localStorage (survives reload) ✅

No turn regressed any earlier feature. AI did not "forget" prior context across 6 sequential prompts (~430 k cumulative prompt tokens at turn 6).

## Pipeline timing notes
- Per-turn TTFT (time-to-first-token) trended UP as prompt grew (402 → 2 950 → 1 486 → 2 251 → 2 084 → 4 423 ms). Expected, but turn 6 hit 4.4 s — worth flagging if endurance pushes 100 turns.
- Edit count was always 1 (or 2 for the seed), suggesting the model converges on a single-file edit per turn (App.tsx). Multi-file edits may be needed at higher complexity.
- Vite HMR + page reload added ~5 s latency per turn for DOM verification (not part of SSE total).

## What this proves
1. **Doable AI chat → SSE → Vite HMR → preview iframe → React-rendered DOM → user click** is a fully working pipeline on env1.
2. Every prompt's described feature actually lands in the rendered, interactive DOM — not just in source code.
3. State mutations work; localStorage persistence works; cross-feature interactions work (clicking +1 updates counter AND history AND max/min); dark-mode toggle works without breaking the counter.
4. Long-conversation context retention is sound through at least 6 turns. Endurance to 100+ should now work given platform-admin rate-limit bypass.

## What this does NOT prove (open work)
- 100-turn endurance still hasn't been measured end-to-end (rate-limit was the historical block; now lifted, but un-tested at that scale).
- Multi-file feature edits (e.g., a turn that edits App.tsx + a new component + package.json) — turn 6 was the most complex and stayed single-file.
- AI-driven backend integration tests (e.g., "use the supabase MCP to fetch rows") — covered by mcp-apps agent.
- Long context drift after dozens of accumulated tool-call rows pushing the assistant text off-screen — covered by ux-toolcall-collapse agent (currently in re-do).
