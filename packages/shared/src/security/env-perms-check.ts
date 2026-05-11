import fs from "node:fs";

/**
 * Warns if the .env file is group/world-readable when running in production.
 * Non-fatal: logs to stderr via console.warn so the warning appears in journalctl.
 */
export function checkEnvFilePerms(envPath?: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const path = envPath ?? ".env";
  try {
    const st = fs.statSync(path);
    // Octal mode: bottom 9 bits are rwxrwxrwx. We want group+other to have NO read bit.
    const groupOtherRead = st.mode & 0o044;
    if (groupOtherRead) {
      const mode = (st.mode & 0o777).toString(8);
      console.warn(
        `[SECURITY] ${path} is mode ${mode} — readable by group/other. chmod 600 it.`
      );
    }
    // Owner check: must be the running uid or warn about perms drift.
    const uid = typeof process.getuid === "function" ? process.getuid() : -1;
    if (uid > 0 && st.uid !== uid && st.uid !== 0) {
      console.warn(
        `[SECURITY] ${path} owned by uid=${st.uid}, process uid=${uid} — perms drift.`
      );
    }
  } catch {
    // .env may not exist if env vars come from systemd EnvironmentFile=. That's fine.
  }
}
