import { useState, useCallback, useEffect, useMemo } from "react";

const COLS = ["A", "B", "C", "D", "E", "F"];
const ROWS = Array.from({ length: 10 }, (_, i) => i + 1);
const STORAGE_KEY = "spreadsheet-data";

const parseFormula = (formula: string, data: Record<string, string>): string => {
  const sumMatch = formula.match(/^=SUM\(([A-F])(\d+):([A-F])(\d+)\)$/i);
  if (sumMatch) {
    const [, startCol, startRow, endCol, endRow] = sumMatch;
    const startColIndex = COLS.indexOf(startCol.toUpperCase());
    const endColIndex = COLS.indexOf(endCol.toUpperCase());
    const start = parseInt(startRow, 10);
    const end = parseInt(endRow, 10);

    let sum = 0;
    for (let col = startColIndex; col <= endColIndex; col++) {
      for (let row = start; row <= end; row++) {
        const key = `${COLS[col]}-${row}`;
        const value = data[key] || "";
        const num = parseFloat(value);
        if (!isNaN(num)) {
          sum += num;
        }
      }
    }
    return sum.toString();
  }
  return formula;
};

export default function App() {
  const [data, setData] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [cellHistory, setCellHistory] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable
    }
  }, [data]);

  const getKey = (col: string, row: number) => `${col}-${row}`;

  const handleInput = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFocus = useCallback(
    (key: string, currentValue: string) => {
      setCellHistory((prev) => ({ ...prev, [key]: currentValue }));
      setActiveCell(key);
    },
    []
  );

  const handleBlur = useCallback(() => {
    setActiveCell(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, col: string, row: number) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const nextRow = row < 10 ? row + 1 : row;
        const nextKey = getKey(col, nextRow);
        setTimeout(() => {
          document.querySelector(`[data-cell="${nextKey}"]`)?.focus();
        }, 0);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const colIndex = COLS.indexOf(col);
        const nextCol = e.shiftKey
          ? COLS[colIndex - 1] || col
          : COLS[colIndex + 1] || col;
        const nextKey = getKey(nextCol, row);
        setTimeout(() => {
          document.querySelector(`[data-cell="${nextKey}"]`)?.focus();
        }, 0);
      }
      if (e.key === "Escape") {
        const key = getKey(col, row);
        setData((prev) => ({ ...prev, [key]: cellHistory[key] || "" }));
        (e.target as HTMLElement).blur();
      }
    },
    [cellHistory]
  );

  const getDisplayValue = useCallback(
    (rawValue: string) => {
      if (rawValue.startsWith("=")) {
        return parseFormula(rawValue, data);
      }
      return rawValue;
    },
    [data]
  );

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Spreadsheet</h1>

        <div className="bg-slate-800 rounded-lg overflow-hidden shadow-xl border border-slate-700">
          {/* Grid container */}
          <div
            className="grid"
            style={{ gridTemplateColumns: "50px repeat(6, 1fr)" }}
          >
            {/* Top-left corner */}
            <div className="bg-slate-700 border-b border-r border-slate-600 h-10" />

            {/* Column headers */}
            {COLS.map((col) => (
              <div
                key={`header-${col}`}
                className="bg-slate-700 border-b border-r border-slate-600 h-10 flex items-center justify-center font-semibold text-slate-300"
              >
                {col}
              </div>
            ))}

            {/* Rows with cells */}
            {ROWS.map((row) => (
              <div key={`row-${row}`} className="contents">
                {/* Row number */}
                <div className="bg-slate-700 border-b border-r border-slate-600 h-12 flex items-center justify-center font-semibold text-slate-400">
                  {row}
                </div>

                {/* Data cells */}
                {COLS.map((col) => {
                  const key = getKey(col, row);
                  const isActive = activeCell === key;
                  const rawValue = data[key] || "";
                  const displayValue = isActive ? rawValue : getDisplayValue(rawValue);

                  return (
                    <div
                      key={key}
                      data-cell={key}
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => handleFocus(key, rawValue)}
                      onBlur={handleBlur}
                      onInput={(e) =>
                        handleInput(key, e.currentTarget.textContent || "")
                      }
                      onKeyDown={(e) => handleKeyDown(e, col, row)}
                      className={`h-12 border-b border-r border-slate-600 px-3 flex items-center text-slate-100 outline-none
                        ${
                          isActive
                            ? "bg-slate-600 ring-2 ring-blue-500"
                            : "bg-slate-800 hover:bg-slate-750"
                        }
                        ${row === 10 ? "border-b-0" : ""}
                      `}
                    >
                      {displayValue}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-slate-400 text-sm">
          <p>
            <span className="text-blue-400">Click</span> to edit •{" "}
            <span className="text-blue-400">Enter</span> to move down •{" "}
            <span className="text-blue-400">Tab</span> to move right •{" "}
            <span className="text-blue-400">Shift+Tab</span> to move left •{" "}
            <span className="text-blue-400">Esc</span> to cancel
          </p>
          <p className="mt-2">
            <span className="text-emerald-400">Formulas:</span> Type{" "}
            <code className="bg-slate-700 px-1 rounded">=SUM(A1:A3)</code> to
            calculate sums. Other formulas display as-is.
          </p>
        </div>
      </div>
    </div>
  );
}