/**
 * schema-inspector.js
 *
 * Renders a table list from a data.schema response.
 * Clicking a table row navigates the iframe to table-inspector for that table.
 *
 * All DOM insertion uses textContent — never innerHTML with raw data.
 */

import { onReady, schema } from "./shared/host-bridge.js";

const statusEl    = document.getElementById("status");
const errorEl     = document.getElementById("error");
const containerEl = document.getElementById("container");

function showError(msg) {
  statusEl.textContent = "";
  errorEl.textContent  = msg;
  errorEl.style.display = "block";
}

function navigateToTable(tableName) {
  // Post a navigation intent to the host; the host re-renders the iframe src
  // with table-inspector?table=<name>.  The host intercepts this message and
  // updates the resourceUri, keeping the scoped token intact.
  window.parent.postMessage(
    { type: "doable.data.navigate", resource: "table-inspector", table: tableName },
    "*",
  );
}

function renderSchema(data) {
  statusEl.textContent = "";
  containerEl.innerHTML = "";

  const tables = Array.isArray(data.tables) ? data.tables : [];

  if (tables.length === 0) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "No tables found. Use data.migrate to create your first table.";
    containerEl.appendChild(p);
    return;
  }

  const table = document.createElement("table");

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Table", "Columns", "Indexes", "FK", "RLS Policies", "Est. Rows"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (const t of tables) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.title = "Click to inspect rows";

    const nameStr   = String(t.name ?? "");
    const colCount  = Array.isArray(t.columns)      ? t.columns.length      : 0;
    const idxCount  = Array.isArray(t.indexes)      ? t.indexes.length      : 0;
    const fkCount   = Array.isArray(t.foreign_keys) ? t.foreign_keys.length : 0;
    const polCount  = Array.isArray(t.policies)     ? t.policies.length     : 0;
    const rowEst    = t.row_count_estimate != null   ? String(t.row_count_estimate) : "—";

    const cells = [nameStr, String(colCount), String(idxCount), String(fkCount), String(polCount), rowEst];
    for (const val of cells) {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    }

    // Render column pills under the table name cell
    if (Array.isArray(t.columns) && t.columns.length > 0) {
      const nameCell = tr.firstChild;
      const pillsDiv = document.createElement("div");
      pillsDiv.style.marginTop = "3px";
      for (const col of t.columns.slice(0, 6)) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = String(col.name ?? col);
        pillsDiv.appendChild(pill);
      }
      if (t.columns.length > 6) {
        const more = document.createElement("span");
        more.className = "pill";
        more.textContent = "+" + (t.columns.length - 6) + " more";
        pillsDiv.appendChild(more);
      }
      nameCell.appendChild(pillsDiv);
    }

    tr.addEventListener("click", () => navigateToTable(nameStr));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  containerEl.appendChild(table);
}

onReady(async () => {
  statusEl.textContent = "Fetching schema…";
  try {
    const result = await schema();
    renderSchema(result);
  } catch (err) {
    showError(err.message ?? "Failed to load schema");
  }
});
