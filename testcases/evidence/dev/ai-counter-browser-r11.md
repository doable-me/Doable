# R11 — Browser-driven counter AI chat E2E (PASS)

**Date**: 2026-05-14
**Driver**: Claude-in-Chrome MCP, real user flow (dashboard textarea → click Send → preview)
**Project**: `35b68fbd-e71c-4f4d-9f6a-04137a3bccbb`
**Prompt**: `Build a single-page counter app. Show a large number starting at 0 in the center. Below it, render three buttons in a row: "+1" (increments), "-1" (decrements), "Reset" (sets to 0). Use Tailwind classes (text-6xl, flex gap-3, etc.). State must persist via React useState in App.tsx.`

## Result — PASS

Generated `src/App.tsx` (32 lines) matches every acceptance criterion:

```tsx
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-8">
        <div className="text-6xl font-bold text-foreground">{count}</div>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setCount((c) => c + 1)} className="px-6 py-3 ...">+1</button>
          <button onClick={() => setCount((c) => c - 1)} className="px-6 py-3 ...">-1</button>
          <button onClick={() => setCount(0)} className="px-6 py-3 ...">Reset</button>
        </div>
      </div>
    </div>
  );
}
```

Acceptance:
- ✅ `useState(0)` initial state
- ✅ `text-6xl` for the large number (literal class)
- ✅ `flex gap-3` for the button row (literal class)
- ✅ "+1" button with increment handler (regex `[\+＋]\s?1`)
- ✅ "-1" button with decrement handler (regex `[\-−–—]\s?1`)
- ✅ "Reset" button with `setCount(0)` handler

## Timing (from trace)
| Stage | T+ms |
|---|---|
| Project create (browser→API) | ~600 ms |
| `POST /chat` 200 | ~3 s |
| TTFT (first AI token) | 5.1 s |
| Tool calls (6 total) | 6 (write_file, view, list_files...) |
| Turn duration | 21.9 s |
| Total prompt tokens | 56,880 |
| Completion tokens | 649 |
| Thinking chars | 1,151 |
| Model | MiniMax-M2.7-highspeed (BYOK provider) |

## Contrast with API-driven PDF run (BUG-R11-PDF-ATTACHMENT-IGNORED-001)
| Metric | Counter (browser) | PDF (API) |
|---|---|---|
| Generated app matches prompt | ✅ yes | ❌ no — default scaffold splash |
| Tool calls | 6 (file writes) | 25 (mostly view/list/bash pdftotext) |
| AI thinking trace | normal | leaked: "this is the default Doable template app... [user] hasn't explicitly told me what to do with it yet" |
| Prompt tokens | 56,880 | 128,595 (PDF text WAS inlined) |
| Completion tokens | 649 | 892 |

## Known universal bugs reproduced (carry-over)
- `session_id: ""` on the trace row (same as every other dev chat trace)
- `GET /chat/history` returns `{"data":[],"hasMore":false}` despite a turn completing

These are documented in `BUG-R11-PDF-ATTACHMENT-IGNORED-001.md` (root causes #2 and #3) and the fix branch `fix/r11-pdf-attachment-prompt-and-persist` is in flight.

## Conclusion
- ✅ Browser-driven AI chat works for a clean prompt without attachments.
- ❌ The PDF-attachment build flow is the specific regression that needs the Opus fix to land.
- ✅ Generated code is correct, well-styled, and follows the Tailwind hint exactly.
- Total turn time of ~22 s is within budget (< 90 s).
