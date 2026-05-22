
import { getSandboxRegistry } from "../../../../packages/dovault/src/sandbox-registry.js";
import { allComposers } from "../../../../packages/dovault/src/composers/index.js";
import { resolveBackend } from "./backend-resolver.js";
import type { SpawnContext } from "./orchestrator.js";

type HardeningLevel = "off" | "dev" | "staging" | "prod";

function parseHardening(raw: string | undefined): HardeningLevel {
  const v = (raw ?? "dev").trim().toLowerCase();
  if (v === "off" || v === "dev" || v === "staging" || v === "prod") {
    return v;
  }
  return "dev";
}

export async function sandboxBootProbe(): Promise<void> {
  const hardening = parseHardening(process.env.DOABLE_HARDENING_LEVEL);
  const pinned = process.env.DOABLE_SANDBOX_BACKEND?.trim();

  console.log(
    `[sandbox] boot probe starting (hardening=${hardening}${
      pinned ? `, pinned=${pinned}` : ""
    })`,
  );

  const registry = getSandboxRegistry();

  // 1. Per-backend availability.
  try {
    const probe = await registry.probeAll();
    for (const [id, avail] of Object.entries(probe)) {
      if (avail.ok) {
        console.log(`[sandbox] backend ${id} available`);
      } else {
        console.log(`[sandbox] backend ${id} UNAVAILABLE: ${avail.reason}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (hardening === "prod" || hardening === "staging") {
      throw new Error(`[sandbox] FAIL-CLOSED at boot: probeAll failed: ${msg}`);
    }
    console.warn(`[sandbox] WARNING: probeAll failed: ${msg}`);
  }

  // 2. Resolve against a synthetic context.
  const ctx: SpawnContext = {
    projectId: "_bootprobe",
    workspaceId: null,
    userId: null, // synthetic — not a real UUID
    sessionId: "_boot",
    hardening,
  };

  try {
    const backend = await resolveBackend(ctx, registry);
    const layers = backend.declaredLayers();
    console.log(
      `[sandbox] resolved backend=${backend.id} declaredLayers=${JSON.stringify(
        layers,
      )}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (hardening === "prod" || hardening === "staging") {
      throw new Error(`[sandbox] FAIL-CLOSED at boot: ${msg}`);
    }
    console.warn(`[sandbox] WARNING: ${msg}`);
  }

  // 3. Configured composers.
  const composerIds = allComposers.map((c) => c.id);
  console.log(
    `[sandbox] configured composers=[${composerIds.join(", ")}]`,
  );
}
