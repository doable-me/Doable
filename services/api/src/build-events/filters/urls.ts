/**
 * URL redactor. Per PRD 04 §3.3.
 *
 * - URLs containing userinfo (https://user:pass@host/...) are fully
 *   redacted to <REDACTED:url>.
 * - URLs with a query string keep host+path skeleton and replace the
 *   query with ?<REDACTED:query>.
 * - URLs with no userinfo and no query are passed through unchanged.
 */

import type { LogFilter } from "./types.js";

// Bounded character classes to avoid catastrophic backtracking.
const URL_RE = /\b(https?:\/\/)([^\s/?#)]+)(\/[^\s?#)]*)?(\?[^\s)]*)?/g;

export function buildUrlRedactor(): LogFilter {
  return {
    id: "url",
    apply(line) {
      return line.replace(
        URL_RE,
        (
          _match: string,
          scheme: string,
          host: string,
          path: string | undefined,
          query: string | undefined,
        ) => {
          if (host && host.includes("@")) {
            return "<REDACTED:url>";
          }
          const pathPart = path ?? "";
          const queryPart = query ? "?<REDACTED:query>" : "";
          return `${scheme}${host}${pathPart}${queryPart}`;
        },
      );
    },
  };
}
