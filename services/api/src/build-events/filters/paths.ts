/**
 * Path redactor. Per PRD 04 §3.2.
 *
 * Strategy:
 *   a) Project-relative rewrite of `ctx.projectPath` -> "".
 *   b) /home/<user>/...           -> <REDACTED:path>
 *   c) C:\Users\<user>\...        -> <REDACTED:path>
 *   d) /root/...                  -> <REDACTED:path>
 *      (excludes /root/doable/projects/ which is the prod app dir)
 *   e) /Users/<mac-user>/...      -> <REDACTED:path>
 */

import type { LogFilter } from "./types.js";

const PATH_TOKEN = "<REDACTED:path>";

const HOME_LINUX = /\/home\/[^/\s]+\/[^\s)]*/g;
const WINDOWS_USERS = /[A-Z]:\\Users\\[^\\]+\\[^\s)]*/gi;
// Negative lookahead skips the prod app's project dir.
const ROOT_DIR = /\/root\/(?!doable\/projects\/)[^\s)]*/g;
const MAC_USERS = /\/Users\/[^/\s]+\/[^\s)]*/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPathRedactor(): LogFilter {
  return {
    id: "path",
    apply(line, ctx) {
      let out = line;

      // a) Project-relative rewrite. Strip the project path and an
      // optional trailing separator.
      if (ctx.projectPath && ctx.projectPath.length > 0) {
        const projectRe = new RegExp(
          escapeRegExp(ctx.projectPath) + "[/\\\\]?",
          "g",
        );
        out = out.replace(projectRe, "");
      }

      // b) Linux user home directories.
      out = out.replace(HOME_LINUX, PATH_TOKEN);

      // c) Windows user profile paths.
      out = out.replace(WINDOWS_USERS, PATH_TOKEN);

      // d) /root/... excluding the deployed app's project workspace root.
      out = out.replace(ROOT_DIR, PATH_TOKEN);

      // e) macOS user home directories.
      out = out.replace(MAC_USERS, PATH_TOKEN);

      return out;
    },
  };
}
