/**
 * table-inspector.js
 *
 * Paginated row viewer for one table.
 *
 * SECURITY: All cell values are set via textContent — NEVER innerHTML with
 * raw data.  This is an XSS-resistance requirement: the per-app database
 * may contain user-supplied data from an untrusted app.
 */

import { onReady, inspect } from "./shared/host-bridge.js";

const PAGE_SIZE = 50;

const backEl      = document.getElementById("back");
const titleEl     = document.getElementById("title");
const statusEl    = document.getElementById("status");
const errorEl     = document.getElementById("error");
const containerEl = document.getElementById("container");
const paginationEl = document.getElementById("pagination");
const btnPrev     = document.getElementById("btn-prev");
const btnNext     = document.getElementById("btn-next");
const pageInfoEl  = document.getElementById("page-info");

// Resolve table name from URL query string (?table=xxx)
const urlParams = new URLSearchParams(window.location.search);
const tableName = urlParams.get("table") ?? "";

let currentOffset = 0;
let totalRows     = 0;
let fields        = [];

backEl.addEventListener("click", () => {
  window.parent.postMessage(
    { type: "doable.data.navigate", resource: "schema-inspector" },
    "*",
  );
});

function showError(msg) {
  statusEl.textContent  = "";
  errorEl.textContent   = msg;
  errorEl.style.display = "block";
}

function renderRows(result) {
  statusEl.textContent = "";
  containerEl.innerHTML = "";

  const rows   = Array.isArray(result.rows)   ? result.rows   : [];
  fields = Array.isArray(result.fields) ? result.fields : [];
  totalRows = result.rowCount ?? rows.length;

  if (rows.length === 0 && currentOffset === 0) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "No rows found.";
    containerEl.appendChild(p);
    paginationEl.style.display = "none";
    return;
  }

  const table = document.createElement("table");

  // Header — use field names from response metadata
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const f of fields) {
    const th = document.createElement("th");
    // SAFE: field names come from pg catalog, not user row data, but we still
    // use textContent for consistency.
    th.textContent = String(f.name ?? f);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const values = Array.isArray(row) ? row : fields.map((f) => row[f.name ?? f]);
    for (const val of values) {
      const td = document.createElement("td");
      // CRITICAL XSS GUARD: use textContent — never innerHTML — for cell values.
      // Cell data is arbitrary user-supplied content from the per-app database.
      td.textContent = val == null ? "" : String(val);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  containerEl.appendChild(table);

  // Pagination controls
  const page = Math.floor(currentOffset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  pageInfoEl.textContent = "Page " + page + " of " + totalPages + " (" + totalRows + " rows)";
  btnPrev.disabled = currentOffset === 0;
  btnNext.disabled = currentOffset + PAGE_SIZE >= totalRows;
  paginationEl.style.display = "flex";
}

async function loadPage() {
  errorEl.style.display = "none";
  statusEl.textContent = "Loading…";
  containerEl.innerHTML = "";
  try {
    const result = await inspect(tableName, undefined, PAGE_SIZE, currentOffset);
    renderRows(result);
  } catch (err) {
    showError(err.message ?? "Failed to load rows");
  }
}

btnPrev.addEventListener("click", () => {
  if (currentOffset >= PAGE_SIZE) {
    currentOffset -= PAGE_SIZE;
    loadPage();
  }
});

btnNext.addEventListener("click", () => {
  currentOffset += PAGE_SIZE;
  loadPage();
});

onReady(() => {
  if (!tableName) {
    showError("No table specified. Add ?table=<name> to the URL.");
    statusEl.textContent = "";
    return;
  }
  // SAFE: tableName comes from the URL query param set by the host, not cell data.
  titleEl.textContent = tableName;
  document.title = tableName + " — Table Inspector";
  loadPage();
});
