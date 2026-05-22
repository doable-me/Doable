#!/usr/bin/env node
/**
 * Spreadsheet Builder — a Doable built-in MCP App.
 * --------------------------------------------------------
 * Standards-compliant per modelcontextprotocol.io/extensions/apps:
 * tools return UIResource cards rendered as sandboxed iframes.
 *
 *   1. `create_spreadsheet({ topic, kind?, audience? })`
 *        Returns a status card that postMessages a BUILD_SPREADSHEET
 *        prompt back to the host. The LLM narrates progress, then
 *        calls `build_spreadsheet` once with a structured spec.
 *
 *   2. `build_spreadsheet({ topic, sheets, fileName? })`
 *        ★ primary tool. Renders the unified card with:
 *          - live HTML table preview (first sheet, all rows)
 *          - Download .xlsx button
 *          - Download .csv button (first sheet)
 *        Uses exceljs to produce a valid Office Open XML workbook.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";
import ExcelJS from "exceljs";

import { autoBuildCardHtml, previewDownloadCardHtml, escapeHtml, slugify } from "../_shared/ui.mjs";

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [SS] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// LLM build prompt
// ─────────────────────────────────────────────────────────────────────────
function buildSpreadsheetPrompt({ topic, kind, audience }) {
  const topicEsc = String(topic).replace(/"/g, '\\"');
  const kindHint =
    kind === "budget"     ? "BUDGET / FINANCIAL: include monthly periods, totals row using SUM, % share, growth rate."
    : kind === "tracker"  ? "TRACKER: status column with values like 'Todo'/'Doing'/'Done', priority, owner, due date."
    : kind === "schedule" ? "SCHEDULE: dates, times, attendees, location/topic, duration formula."
    : kind === "data"     ? "DATA TABLE: clean tabular data with appropriate types per column."
    : kind === "report"   ? "REPORT: summary sheet + detail sheets, headline KPIs at the top."
    : kind === "comparison" ? "COMPARISON: rows = options, columns = criteria, scoring + total."
    : "Pick the most natural shape for the topic — table of data, comparison matrix, tracker, budget, or schedule.";
  return [
    `BUILD_SPREADSHEET topic="${topicEsc}"${audience ? ` audience="${String(audience).replace(/"/g, '\\"')}"` : ""}${kind ? ` kind="${kind}"` : ""}`,
    ``,
    `You are about to design a useful, accurate spreadsheet — not a placeholder. Real data, real columns, real formulas where they help.`,
    ``,
    `━━━ TRANSPARENCY (visible chat lines) ━━━`,
    `Stream these short status lines as plain assistant chat content (NOT inside thinking blocks). Blank line before/after each. Do not batch.`,
    `  1. "🔍 Researching ${topicEsc}…"   (call web_search NOW if needed)`,
    `  2. "📐 Designing the column structure…"`,
    `  3. "📊 Filling rows with real data…"`,
    `  4. "🧮 Adding formulas and totals…"`,
    `  5. "🚀 Saving the workbook…"   → then the tool call.`,
    ``,
    `FORBIDDEN visible output: reasoning, "Let me think…", code fences, the JSON spec before the tool call.`,
    ``,
    `━━━ DELIVERABLE — call build_spreadsheet({ topic, sheets }) ONCE ━━━`,
    ``,
    `Spec shape:`,
    `  topic:  string`,
    `  sheets: array of:`,
    `    {`,
    `      name:    string (≤ 31 chars, no [ ] : * ? / \\)`,
    `      columns: array of { header, key, width?, format? }`,
    `               format ∈ "text" | "number" | "currency" | "percent" | "date" | "datetime"`,
    `      rows:    array of objects keyed by column.key.`,
    `               String values that start with "=" are treated as formulas (e.g. "=SUM(B2:B10)").`,
    `      totals?: { columns: [keys] }   // engine appends a totals row using SUM`,
    `      freezeHeader?: boolean (default true)`,
    `      tableStyle?: "default" | "minimal" | "alt"`,
    `    }`,
    ``,
    `${kindHint}`,
    ``,
    `Quality rules:`,
    `- Real numbers, real names, real categories. No "Item 1" / "Sample". Use plausible domain data.`,
    `- 8–40 rows is the sweet spot. More only when the topic clearly demands it.`,
    `- Add formulas where they CALCULATE (totals, percentages, growth) — never hardcode a sum.`,
    `- Currency columns: use plain numbers in cells (e.g. 12500), set format:"currency".`,
    `- Percent columns: 0.18 means 18%; set format:"percent".`,
    `- Dates: use ISO strings "2026-05-01" or formula =TODAY(); set format:"date".`,
    `- Set sensible column widths (10–32). Wide for free text, narrow for numbers.`,
    `- Add a second sheet for assumptions / lookups when relevant.`,
    ``,
    `After the tool returns, reply with EXACTLY one short sentence ("Spreadsheet ready — preview and download above.") and STOP. Do NOT call write_file.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "create_spreadsheet",
    description:
      "Kick off a creative spreadsheet build. REQUIRED for any request involving a spreadsheet, "
      + "Excel file, .xlsx, .csv, table, tracker, budget, schedule, comparison matrix, financial "
      + "model, or data export. Returns a small status card that immediately injects a "
      + "BUILD_SPREADSHEET prompt back as the next user turn — instructing you (the AI) to "
      + "narrate your design and call build_spreadsheet ONCE with a structured spec. After "
      + "invoking this, reply with ONE short sentence ('Designing your spreadsheet…') and stop.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Subject of the spreadsheet (required)." },
        kind: {
          type: "string",
          enum: ["data", "budget", "tracker", "schedule", "report", "comparison"],
          description: "Optional shape hint. Default: data.",
        },
        audience: { type: "string", description: "Who will use it (e.g. 'finance team', 'students')." },
      },
      required: ["topic"],
    },
  },
  {
    name: "build_spreadsheet",
    description:
      "★ PRIMARY spreadsheet renderer. Call ONCE with a structured `sheets` spec. Returns a "
      + "unified card with table preview, Download .xlsx, Download .csv. Use ONLY in response "
      + "to a BUILD_SPREADSHEET prompt. Do NOT also call write_file.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Spreadsheet topic (used for filename + caption)." },
        sheets: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Sheet name (≤ 31 chars, no [] :*?/\\)." },
              columns: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    header: { type: "string" },
                    key: { type: "string", description: "Used to look up values in rows." },
                    width: { type: "number" },
                    format: { type: "string", enum: ["text", "number", "currency", "percent", "date", "datetime"] },
                  },
                  required: ["header", "key"],
                },
              },
              rows: {
                type: "array",
                description: "Each row is an object keyed by column.key. String values starting with '=' are formulas.",
                items: { type: "object" },
              },
              totals: {
                type: "object",
                properties: { columns: { type: "array", items: { type: "string" } } },
                description: "Optional: engine appends a totals row using SUM for these column keys.",
              },
              freezeHeader: { type: "boolean", description: "Default true." },
              tableStyle: { type: "string", enum: ["default", "minimal", "alt"] },
            },
            required: ["name", "columns", "rows"],
          },
        },
        fileName: { type: "string", description: "Optional base filename (no extension)." },
      },
      required: ["topic", "sheets"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// XLSX rendering with exceljs
// ─────────────────────────────────────────────────────────────────────────
const FORMAT_MAP = {
  text:     "@",
  number:   "#,##0.00",
  currency: '"$"#,##0.00;[Red]\\("$"#,##0.00\\)',
  percent:  "0.0%",
  date:     "yyyy-mm-dd",
  datetime: "yyyy-mm-dd hh:mm",
};

function colLetter(idx /* 1-based */) {
  let s = "";
  let n = idx;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function safeSheetName(name, fallback) {
  let s = String(name || fallback || "Sheet1");
  s = s.replace(/[\[\]:*?/\\]/g, " ").trim();
  if (!s) s = fallback || "Sheet1";
  if (s.length > 31) s = s.slice(0, 31);
  return s;
}

function coerceCellValue(raw, format) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      // exceljs formula syntax
      return { formula: raw.slice(1) };
    }
    if (format === "date" || format === "datetime") {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (format === "number" || format === "currency" || format === "percent") {
      const n = Number(raw.replace(/[, $]/g, ""));
      if (!Number.isNaN(n)) return n;
    }
    return raw;
  }
  return raw;
}

async function buildXlsxBuffer({ topic, sheets }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Doable · Spreadsheet Builder";
  wb.created = new Date();
  wb.title = topic;

  for (let s = 0; s < sheets.length; s++) {
    const def = sheets[s];
    const ws = wb.addWorksheet(safeSheetName(def.name, `Sheet${s + 1}`), {
      views: def.freezeHeader === false ? [] : [{ state: "frozen", ySplit: 1 }],
    });
    const cols = (def.columns || []).map((c) => ({
      header: c.header,
      key: c.key,
      width: typeof c.width === "number" && c.width > 4 ? c.width : 16,
    }));
    ws.columns = cols;
    // Header row style.
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };
    headerRow.height = 22;

    // Apply per-column number formats.
    (def.columns || []).forEach((c, idx) => {
      if (c.format && FORMAT_MAP[c.format]) {
        ws.getColumn(idx + 1).numFmt = FORMAT_MAP[c.format];
      }
    });

    // Add data rows.
    const rows = Array.isArray(def.rows) ? def.rows : [];
    for (const row of rows) {
      const obj = {};
      for (const col of def.columns || []) {
        obj[col.key] = coerceCellValue(row?.[col.key], col.format);
      }
      ws.addRow(obj);
    }

    // Optional totals row using SUM over the data range.
    if (def.totals && Array.isArray(def.totals.columns) && def.totals.columns.length > 0 && rows.length > 0) {
      const totalRowIdx = rows.length + 2;
      const totalObj = {};
      let firstColKey = (def.columns?.[0]?.key) || null;
      if (firstColKey) totalObj[firstColKey] = "Total";
      for (const key of def.totals.columns) {
        const colIdx = (def.columns || []).findIndex((c) => c.key === key);
        if (colIdx < 0) continue;
        const letter = colLetter(colIdx + 1);
        totalObj[key] = { formula: `SUM(${letter}2:${letter}${rows.length + 1})` };
      }
      const r = ws.addRow(totalObj);
      r.font = { bold: true };
      r.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
      });
      void totalRowIdx;
    }

    // Light banding for readability when style != "minimal".
    if (def.tableStyle !== "minimal" && rows.length > 0) {
      for (let r = 2; r <= rows.length + 1; r++) {
        if (r % 2 === 0) {
          ws.getRow(r).eachCell((cell) => {
            if (!cell.fill || cell.fill.type !== "pattern") {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
            }
          });
        }
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildCsvFromSheet(sheet) {
  const cols = sheet.columns || [];
  const headers = cols.map((c) => c.header);
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape(formatCsvCell(r?.[c.key], c.format))).join(","));
  }
  return lines.join("\n") + "\n";
}

function formatCsvCell(v, format) {
  if (v == null) return "";
  if (typeof v === "string") {
    if (v.startsWith("=")) return v; // keep formula text in CSV
    return v;
  }
  if (v instanceof Date) return v.toISOString().slice(0, format === "datetime" ? 16 : 10).replace("T", " ");
  if (format === "percent" && typeof v === "number") return (v * 100).toFixed(2) + "%";
  return String(v);
}

function csvEscape(s) {
  const str = String(s ?? "");
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// ─────────────────────────────────────────────────────────────────────────
// HTML preview of the first sheet (rendered inside the iframe)
// ─────────────────────────────────────────────────────────────────────────
function buildPreviewHtml({ topic, sheets, totalRowsSecondary = 0 }) {
  const MAX_PREVIEW_ROWS = 12;
  const tabsHtml = sheets
    .map((sh, i) => `<button class="tab${i === 0 ? " active" : ""}" data-idx="${i}">${escapeHtml(sh.name)}</button>`)
    .join("");
  const tablesHtml = sheets
    .map((sh, i) => `<div class="tbl-wrap${i === 0 ? " active" : ""}" data-idx="${i}">${renderSheetTable(sh, MAX_PREVIEW_ROWS)}</div>`)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(topic)}</title>
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; padding: 0; font: 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color: #1a1a2e; background: #ffffff; }
  .head { padding: 10px 14px 6px; border-bottom: 1px solid #f0f0f5; }
  .ttl { font-weight: 600; font-size: 12px; color: #1a1a2e; }
  .sub { font-size: 10px; color: #6b7280; margin-top: 1px; }
  .tabs { display: flex; gap: 2px; padding: 6px 10px 0; flex-wrap: wrap; border-bottom: 1px solid #f0f0f5; background: #fafafa; }
  .tab { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 6px 6px 0 0; font-size: 10px; font-weight: 500; color: #6b7280; border: 1px solid transparent; border-bottom: none; }
  .tab:hover { background: #ffffff; color: #1a1a2e; }
  .tab.active { background: #ffffff; color: #1a1a2e; border-color: #f0f0f5; font-weight: 600; }
  .tbl-wrap { display: none; padding: 0; overflow: hidden; }
  .tbl-wrap.active { display: block; }
  table { border-collapse: collapse; width: 100%; font-size: 10px; }
  th, td { border: 1px solid #f0f0f5; padding: 4px 8px; text-align: left; vertical-align: top; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
  th { background: #6d28d9; color: #ffffff; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  tr.alt td { background: #faf8ff; }
  tr.totals td { background: #f3f0ff; font-weight: 600; border-top: 2px solid #c4b5fd; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.formula { color: #7c3aed; font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size: 9px; }
  .more-indicator { padding: 6px 14px; text-align: center; font-size: 10px; color: #9ca3af; font-style: italic; background: #fafafa; border-top: 1px solid #f0f0f5; }

  /* dark */
  html[data-theme="dark"] body { background: #111113; color: #e4e4e7; }
  html[data-theme="dark"] .head { border-bottom-color: #27272a; }
  html[data-theme="dark"] .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .sub { color: #a1a1aa; }
  html[data-theme="dark"] .tabs { background: #18181b; border-bottom-color: #27272a; }
  html[data-theme="dark"] .tab { color: #a1a1aa; }
  html[data-theme="dark"] .tab:hover { background: #111113; color: #f4f4f5; }
  html[data-theme="dark"] .tab.active { background: #111113; color: #f4f4f5; border-color: #27272a; }
  html[data-theme="dark"] th, html[data-theme="dark"] td { border-color: #27272a; }
  html[data-theme="dark"] th { background: #7c3aed; color: #ffffff; }
  html[data-theme="dark"] tr.alt td { background: #18181b; }
  html[data-theme="dark"] tr.totals td { background: #1e1b4b; border-top-color: #4c1d95; }
  html[data-theme="dark"] td.formula { color: #a78bfa; }
  html[data-theme="dark"] .more-indicator { background: #18181b; border-top-color: #27272a; color: #71717a; }
</style></head>
<body>
<div class="head">
  <div class="ttl">${escapeHtml(topic)}</div>
  <div class="sub">${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${sheets.reduce((acc, sh) => acc + (Array.isArray(sh.rows) ? sh.rows.length : 0), 0) + totalRowsSecondary} rows</div>
</div>
<div class="tabs">${tabsHtml}</div>
${tablesHtml}
<script>
  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.idx === idx);
      for (const w of document.querySelectorAll('.tbl-wrap')) w.classList.toggle('active', w.dataset.idx === idx);
    });
  }
</script>
</body></html>`;
}

function renderSheetTable(sheet, maxRows = 200) {
  const cols = sheet.columns || [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const visibleRows = rows.slice(0, maxRows);
  const head = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("")}</tr></thead>`;
  const numFormats = new Set(["number", "currency", "percent"]);
  const bodyRows = visibleRows.map((r, i) => {
    const tds = cols.map((c) => {
      const v = r?.[c.key];
      const isFormula = typeof v === "string" && v.startsWith("=");
      const isNum = numFormats.has(c.format);
      const cls = [isNum ? "num" : "", isFormula ? "formula" : ""].filter(Boolean).join(" ");
      const text = formatCsvCell(v, c.format);
      return `<td${cls ? ` class="${cls}"` : ""}>${escapeHtml(text)}</td>`;
    }).join("");
    return `<tr${i % 2 === 1 ? ' class="alt"' : ""}>${tds}</tr>`;
  });
  // Totals preview
  let totalsRow = "";
  if (sheet.totals && Array.isArray(sheet.totals.columns) && sheet.totals.columns.length > 0 && rows.length > 0) {
    const totalsKeys = new Set(sheet.totals.columns);
    const tds = cols.map((c, idx) => {
      if (idx === 0) return `<td><strong>Total</strong></td>`;
      if (totalsKeys.has(c.key)) {
        const sum = rows.reduce((acc, r) => {
          const v = r?.[c.key];
          if (typeof v === "number") return acc + v;
          if (typeof v === "string" && !v.startsWith("=")) {
            const n = Number(v.replace(/[, $%]/g, ""));
            if (!Number.isNaN(n)) return acc + n;
          }
          return acc;
        }, 0);
        const formatted = c.format === "currency" ? `$${sum.toFixed(2)}`
          : c.format === "percent" ? `${(sum * 100).toFixed(1)}%`
          : sum.toLocaleString();
        return `<td class="num"><strong>${escapeHtml(formatted)}</strong></td>`;
      }
      return `<td></td>`;
    }).join("");
    totalsRow = `<tr class="totals">${tds}</tr>`;
  }
  const more = rows.length > maxRows ? `<div class="more-indicator">… and ${rows.length - maxRows} more rows in the download</div>` : "";
  return `<table>${head}<tbody>${bodyRows.join("")}${totalsRow}</tbody></table>${more}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "spreadsheet-builder", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call ${name}`);

  if (name === "create_spreadsheet") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    const opts = { topic, kind: args?.kind, audience: args?.audience };
    const html = autoBuildCardHtml({
      topic,
      title: "Designing your spreadsheet…",
      subtitle: "Warming up — picking the structure.",
      displayText: `📊 Designing a spreadsheet about "${topic}"…`,
      buildPrompt: buildSpreadsheetPrompt(opts),
      accent: {
        lightBg1: "#faf8ff", lightBg2: "#f3f0ff", lightBorder: "#c4b5fd",
        lightTitle: "#6d28d9", lightSub: "#7c3aed",
        spinTrack: "#c4b5fd", spinHead: "#7c3aed", scrollLight: "#c4b5fd",
      },
    });
    const ui = createUIResource({
      uri: `ui://spreadsheet-builder/auto-build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text:
            "Build card shown. It will inject a BUILD_SPREADSHEET prompt back as a new user turn. "
            + "Reply with ONE short sentence like \"Designing your spreadsheet…\" and STOP. "
            + "DO NOT call write_file, create_file, edit_file, str_replace, or any other tool — "
            + "the next user turn will arrive automatically. "
            + "Wait for the BUILD_SPREADSHEET prompt, then narrate progress and call build_spreadsheet once.",
        },
      ],
    };
  }

  if (name === "build_spreadsheet") {
    const topic = String(args?.topic ?? "").trim() || "spreadsheet";
    const sheets = Array.isArray(args?.sheets) ? args.sheets : [];
    const baseName = String(args?.fileName ?? slugify(topic));
    if (sheets.length === 0) {
      return { isError: true, content: [{ type: "text", text: "Error: `sheets` must be a non-empty array." }] };
    }
    for (const s of sheets) {
      if (!s || typeof s !== "object") {
        return { isError: true, content: [{ type: "text", text: "Error: each sheet must be an object." }] };
      }
      if (!Array.isArray(s.columns) || s.columns.length === 0) {
        return { isError: true, content: [{ type: "text", text: `Error: sheet "${s.name || ""}" is missing columns.` }] };
      }
      if (!Array.isArray(s.rows)) s.rows = [];
    }

    let xlsxBuf;
    try {
      xlsxBuf = await buildXlsxBuffer({ topic, sheets });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `XLSX render failed: ${msg}` }] };
    }

    const csv = buildCsvFromSheet(sheets[0]);
    const csvBuf = Buffer.from(csv, "utf8");

    const previewHtml = buildPreviewHtml({ topic, sheets });
    const totalRows = sheets.reduce((acc, s) => acc + (Array.isArray(s.rows) ? s.rows.length : 0), 0);

    const card = previewDownloadCardHtml({
      title: `${baseName}.xlsx`,
      subtitle: `${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${totalRows} rows · "${topic}"`,
      previewKind: "iframe-html",
      previewHtml,
      iconEmoji: "📊",
      hint: "Live table preview · download .xlsx (formulas + formatting) or .csv (first sheet)",
      downloads: [
        {
          label: "📥 Download .xlsx",
          fileName: `${baseName}.xlsx`,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: xlsxBuf.toString("base64"),
          sizeBytes: xlsxBuf.length,
        },
        {
          label: "📄 Download .csv",
          fileName: `${baseName}.csv`,
          mimeType: "text/csv;charset=utf-8",
          base64: csvBuf.toString("base64"),
          sizeBytes: csvBuf.length,
        },
      ],
      accent: { primary: "#6d28d9", primaryHover: "#5b21b6", secondary: "#6d28d9", secondaryHover: "#5b21b6" },
    });

    const ui = createUIResource({
      uri: `ui://spreadsheet-builder/build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: card },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text: `Spreadsheet ready: ${baseName}.xlsx (${sheets.length} sheets, ${totalRows} rows). User can preview, download .xlsx, or download .csv. Acknowledge briefly and stop.`,
        },
      ],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
dlog("MCP server started.");
