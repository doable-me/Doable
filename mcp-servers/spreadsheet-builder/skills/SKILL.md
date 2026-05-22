---
name: xlsx
description: Spreadsheet creation guidance for Doable's spreadsheet-builder MCP App. Adapted from the Anthropic xlsx skill — focuses on real data, hierarchical column structure, formulas (never hardcoded sums), and standards-compliant Office Open XML output via exceljs.
---

# Spreadsheet design guide

Adapted for Doable's `spreadsheet-builder` MCP App. The actual file
is rendered server-side with [exceljs](https://github.com/exceljs/exceljs).

## Hard requirements

### Use formulas, never hardcoded calculations
- Totals: `=SUM(B2:B10)` — never compute the number yourself.
- Percent share: `=B2/$B$11` — anchor the denominator with `$`.
- Growth: `=(C2-B2)/B2`.
- Lookups: `=VLOOKUP(A2, Assumptions!A:B, 2, FALSE)` — split data and assumptions
  into separate sheets when relevant.

### Zero formula errors
- No `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.
- Verify: sums match a manual spot-check, ranges include all data rows,
  no division by an unset cell.

### Real data, not placeholders
- Real names, real numbers, real categories.
- 8–40 rows is the sweet spot. Don't pad with `"Item 5"`, `"Item 6"`.

## Color/format conventions

When the topic is a financial model, default to:

| Role | Convention |
|------|-----------|
| Hardcoded inputs | Plain numbers (engine renders blue is optional) |
| Formulas | Plain numbers (engine renders black) |
| Currency | `format: "currency"` → renders `$#,##0.00` |
| Percent | `format: "percent"` → 0.18 in the cell renders as `18.0%` |
| Years | `format: "text"` → keeps `2024` from being treated as a number |
| Dates | `format: "date"` → ISO string in cell, renders `yyyy-mm-dd` |

The engine handles a styled header row (dark fill, white bold text)
and zebra-striped data rows automatically — no need to specify per cell.

## Choosing a `kind`

| kind | When to use | Typical structure |
|------|------------|-------------------|
| `data` | Pure tabular dataset, no totals | Header + rows |
| `budget` | Financial plan / costs | Categories × periods + totals row + variance |
| `tracker` | TODO / project tracker | Item, owner, status, due, priority, notes |
| `schedule` | Calendar / agenda | Date, time, attendees, topic, duration |
| `report` | KPI dashboard + detail | Summary sheet + per-section sheets |
| `comparison` | Decision matrix | Options × criteria + score + total |

## Structure rules

- ONE topic per sheet. Use multiple sheets when the data is genuinely
  multi-faceted (Inputs, Calculations, Outputs).
- Sheet 1 = the most important / summary view.
- Add a separate `Assumptions` sheet for inputs that drive multiple
  formulas — let users tweak a single cell to flow through everything.
- Always set `freezeHeader: true` so the header row sticks while
  scrolling.
- Set sensible column widths: 10–14 for numbers, 18–28 for free text,
  30+ for note/description fields.

## What NOT to do

- ❌ Sum in JavaScript and put the number in the cell. Use `=SUM(...)`.
- ❌ Use `'2024` or other text tricks for years — set `format: "text"` on the column.
- ❌ Use percent string `"18%"` — put `0.18` in the cell with `format: "percent"`.
- ❌ Mix numbers and strings in the same numeric column.
- ❌ Create one giant sheet when 2–3 cleanly separated sheets would
  read better.
- ❌ Use sheet names with `[ ] : * ? / \` — the engine strips them but
  it indicates poor naming.
