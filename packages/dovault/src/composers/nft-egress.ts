import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

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
    const rulesPath = `${workDir}/.sandbox/nft.rules`;
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
            // Skip silently when projectDir is owned by a dropped-priv sandbox
            // uid (e.g. dev-uid-allocator chowned to 10001) and the API process
            // (uid 5000) can't write into it. The rules file is currently a
            // stub (TODO L42 — never actually loaded into nftables), so the
            // dev process can boot without it. R14 will properly route this
            // through sandbox-spawn so the file lands in the right namespace.
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM") {
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
