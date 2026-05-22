import { mkdir, writeFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

// R14: composer markers used to land under <workDir>/.sandbox/, but after
// dev-uid-allocator chowns <workDir> to the per-project sandbox uid (uid
// 10001+), the API uid (doable) can no longer write there. We now write to
// a sibling state dir owned by the doable user (provisioned at install time
// by deployment/server-setup.sh) and keyed by projectId derived from the
// workDir basename.
const SANDBOX_STATE_DIR =
  process.env.DOABLE_SANDBOX_STATE_DIR ?? "/var/lib/doable/sandbox";

function markerDirFor(workDir: string): string {
  return join(SANDBOX_STATE_DIR, basename(workDir));
}

export const nftEgress: Composer = {
  id: "nft-egress",
  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean {
    return (
      process.platform === "linux" &&
      profile.ns.net === "egress-allowlist" &&
      !declared.nftEgress
    );
  },
  build(profile: SandboxProfile, workDir: string): {
    preflight: PreflightStep[];
    teardown: TeardownStep[];
  } {
    const rulesPath = join(markerDirFor(workDir), "nft.rules");
    const policy = profile.network.defaultAction === "deny" ? "drop" : "accept";
    const allowEntries = profile.network.allow
      .map((h) => `# allow ${h}`)
      .join("\n      ");
    const denyEntries = profile.network.deny
      .map((h) => `# deny ${h}`)
      .join("\n      ");
    const rules = `table inet doable_egress {
    chain output {
      type filter hook output priority 0; policy ${policy};
      // ALLOW entries
      ${allowEntries}
      // DENY entries
      ${denyEntries}
    }
  }
  // TODO: load via nft -f and tag rule with cgroup classid
`;
    const preflight: PreflightStep[] = [
      {
        id: "nft-egress:write-rules",
        async run() {
          try {
            await mkdir(dirname(rulesPath), { recursive: true });
            await writeFile(rulesPath, rules, "utf8");
          } catch (err) {
            // R14: marker now lives under DOABLE_SANDBOX_STATE_DIR (doable-owned)
            // so EACCES is no longer expected on the chowned project tree. But
            // if the state dir wasn't provisioned (e.g. old server, container
            // without the install-time mkdir) we still skip rather than crash.
            // The rules file is currently a stub (TODO L42 — never actually
            // loaded into nftables), so booting without it is safe.
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM" || e?.code === "ENOENT") {
              console.warn(`[nft-egress] ${e.code} on ${rulesPath} — skipping nft rules write (state dir not provisioned?)`);
              return;
            }
            throw err;
          }
        },
      },
    ];
    const teardown: TeardownStep[] = [
      {
        id: "nft-egress:remove-rules",
        async run() {
          try {
            await unlink(rulesPath);
          } catch {
            /* ignore */
          }
        },
      },
    ];
    return { preflight, teardown };
  },
};

void ComposerError;
