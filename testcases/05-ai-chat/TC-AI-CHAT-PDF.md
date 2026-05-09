# TC-AI-CHAT-PDF — Multi-turn PDF generator (jsPDF)

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`
Runner: `testcases/evidence/run-granular-turn.sh`

Verifies Doable AI can scaffold a real-world invoice PDF generator across
five incremental turns, each tightening the spec. Beyond SSE/preview timing,
this TC also proves the AI populates `package.json` with the required runtime
dep (`jspdf`) so the dev server can actually `npm install` it.

## Acceptance taxonomy
Each turn ships its own ACCEPT regex (`|`-separated). Hit ratio is recorded
in `testcases/evidence/${ENV}/app-pdf/app-pdf.summary.csv` and a per-turn
generated `App.tsx` snapshot is stored beside the SSE log. A turn passes
only if **all** ACCEPT phrases are found in the post-turn `App.tsx`.

After turn 1, the runner SSHes to the dev box and asserts:
```bash
sudo grep -E '"jspdf"|"jsPDF"' /opt/doable/services/api/projects/<id>/package.json
```
Missing dep → file BUG-PDF-DEPS (npm install rerun required).

## TC-AI-CHAT-PDF-001 — Seed: invoice form + jsPDF dep
- **Prompt:** `Build an invoice generator. Form has: company name, customer name, list of items (description, qty, unit price), tax %. Below it a 'Generate PDF' button using jsPDF. Add jsPDF to deps.`
- **ACCEPT:** `jsPDF|jspdf|new jsPDF|doc\.save`
- **Extra check:** `package.json` contains `jspdf`.
- **Severity:** smoke (gates the test)

## TC-AI-CHAT-PDF-002 — Live preview pane
- **Prompt:** `Show a live preview of the invoice on the right side using HTML/Tailwind so the user can see what the PDF will contain before generating.`
- **ACCEPT:** `preview|grid-cols-2|invoice`
- **Severity:** high

## TC-AI-CHAT-PDF-003 — PDF content (header/customer/table/totals)
- **Prompt:** `When clicking Generate PDF, the PDF should include: company header, customer block, item table, subtotal/tax/total computed automatically.`
- **ACCEPT:** `autoTable|doc\.text|subtotal|total`
- **Severity:** high

## TC-AI-CHAT-PDF-004 — Save Draft via localStorage
- **Prompt:** `Add a 'Save Draft' button that saves all form fields to localStorage.`
- **ACCEPT:** `localStorage|setItem.*draft|getItem.*draft`
- **Severity:** medium

## TC-AI-CHAT-PDF-005 — Dynamic add/remove item rows
- **Prompt:** `Add an 'Add Item' button that appends a new row, and an 'X' on each row to remove it.`
- **ACCEPT:** `setItems|filter.*idx|Add Item`
- **Severity:** medium

## Runner invocation
```bash
ENV_NAME=env1 API_BASE_URL=https://zantaz-api.doable.me \
  PROJECT_ID=<project-id> TEST_NAME=app-pdf TURN=N \
  ACCEPT_PHRASES="<regex>" PROMPT="<prompt>" \
  bash testcases/evidence/run-granular-turn.sh
```

Evidence dir: `testcases/evidence/env1/app-pdf/`.
Run log: `testcases/99-runlog/env1/app-pdf.md`.
