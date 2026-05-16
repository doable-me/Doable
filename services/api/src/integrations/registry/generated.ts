// ─── Auto-generated integration registry (stub) ──────────────────────
//
// This file is intentionally an empty stub so a fresh clone boots
// without running a code generator. The curated categories living
// alongside this file (communication, productivity, developer-tools,
// ai-ml, crm-marketing-social, finance-ecommerce) provide the actual
// integration definitions for OSS users.
//
// If you have an internal `tools/generate-registry.ts` that scans the
// installed @activepieces/* packages and produces a richer registry,
// it should overwrite this file during build. The boot-time pruning
// in ./index.ts will still strip any entries whose piecePackage isn't
// installed, so an over-eager generator is also safe.
import type { IntegrationDefinition } from "../types.js";

export const GENERATED_REGISTRY: Record<string, IntegrationDefinition> = {};
