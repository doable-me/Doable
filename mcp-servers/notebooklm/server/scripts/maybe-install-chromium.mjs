import { spawnSync } from "node:child_process";

const skip =
  process.env.DOABLE_SKIP_BROWSERS === "1" ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1";

if (skip) {
  console.log("Skipping Playwright Chromium (DOABLE_SKIP_BROWSERS / PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).");
  process.exit(0);
}

const r = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
