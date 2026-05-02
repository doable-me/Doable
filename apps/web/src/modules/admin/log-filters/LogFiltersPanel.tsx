import { useState, type ReactElement, type FormEvent } from "react";
import { useLogFilters, type LogFilter } from "./useLogFilters";

interface LogFiltersPanelProps {
  workspaceId: string;
}

const DEFAULT_DENY_TOKEN = "<REDACTED:custom>";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

export function LogFiltersPanel({
  workspaceId,
}: LogFiltersPanelProps): ReactElement {
  const { filters, loading, error, create, toggle, remove } =
    useLogFilters(workspaceId);

  const [filterId, setFilterId] =
    useState<"deny-pattern" | "drop-pattern">("deny-pattern");
  const [pattern, setPattern] = useState("");
  const [token, setToken] = useState(DEFAULT_DENY_TOKEN);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!pattern.trim()) {
      setFormError("Pattern is required");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const config: { pattern: string; token?: string } = {
        pattern: pattern.trim(),
      };
      if (filterId === "deny-pattern") {
        config.token = token.trim() || DEFAULT_DENY_TOKEN;
      }
      await create({ filter_id: filterId, config });
      setPattern("");
      setToken(DEFAULT_DENY_TOKEN);
      setFilterId("deny-pattern");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (
    f: LogFilter,
    nextEnabled: boolean
  ): Promise<void> => {
    try {
      await toggle(f.id, nextEnabled);
    } catch {
      // no-op; row stays as-is, refresh failure surfaces via hook error
    }
  };

  const handleDelete = async (f: LogFilter): Promise<void> => {
    const ok = window.confirm(
      `Delete this ${f.filter_id} for "${truncate(f.config.pattern, 40)}"?`
    );
    if (!ok) return;
    try {
      await remove(f.id);
    } catch {
      // surface via hook error on refresh
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-neutral-900">
          Log filters
        </h2>
        <span className="text-xs text-neutral-500">
          {filters.length} active
        </span>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading filters...</div>
      ) : filters.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500">
          No filters configured.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100 rounded border border-neutral-200">
          {filters.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <span
                className={
                  f.filter_id === "deny-pattern"
                    ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                    : "rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800"
                }
              >
                {f.filter_id}
              </span>
              <code className="flex-1 truncate font-mono text-xs text-neutral-700">
                {truncate(f.config.pattern, 40)}
              </code>
              {f.filter_id === "deny-pattern" && f.config.token ? (
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600">
                  {f.config.token}
                </code>
              ) : null}
              <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) => handleToggle(f, e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                enabled
              </label>
              <button
                type="button"
                onClick={() => handleDelete(f)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded border border-neutral-200 bg-neutral-50 p-3"
      >
        <div className="text-sm font-medium text-neutral-800">Add filter</div>

        <div className="flex gap-4 text-sm text-neutral-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="filter_id"
              value="deny-pattern"
              checked={filterId === "deny-pattern"}
              onChange={() => setFilterId("deny-pattern")}
            />
            deny-pattern
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="filter_id"
              value="drop-pattern"
              checked={filterId === "drop-pattern"}
              onChange={() => setFilterId("drop-pattern")}
            />
            drop-pattern
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="log-filter-pattern"
            className="text-xs font-medium text-neutral-600"
          >
            Pattern
          </label>
          <input
            id="log-filter-pattern"
            type="text"
            required
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. password=\\S+"
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-mono text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        {filterId === "deny-pattern" ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="log-filter-token"
              className="text-xs font-medium text-neutral-600"
            >
              Replacement token
            </label>
            <input
              id="log-filter-token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={DEFAULT_DENY_TOKEN}
              className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-mono text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </div>
        ) : null}

        {formError ? (
          <div className="text-xs text-red-700">{formError}</div>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {submitting ? "Adding..." : "Add filter"}
          </button>
        </div>
      </form>
    </div>
  );
}
