/**
 * Smoke test: verify PDF text is extracted and inlined into augmentedPrompt.
 * Run: pnpm exec tsx scripts/test-pdf-attach.ts
 */

import { readFileSync } from "fs";
import { processAttachments } from "../services/api/src/ai/attachments.ts";

const PDF_PATH = "C:/Users/gj/Downloads/srs_example_2010_group2.pdf";

async function main() {
  const buffer = readFileSync(PDF_PATH);
  const b64 = buffer.toString("base64");

  const result = await processAttachments(
    [
      {
        type: "application/pdf",
        name: "srs.pdf",
        data: "data:application/pdf;base64," + b64,
      },
    ],
    "Build the app described in this SRS",
  );

  console.log("augmentedPrompt.length:", result.augmentedPrompt.length);
  console.log("first_500_chars:");
  console.log(JSON.stringify(result.augmentedPrompt.slice(0, 500)));
  console.log("\nfileAttachments:", result.fileAttachments.length);

  // Heuristic check: SRS doc body should appear in prompt (contains "SRS" or "Requirements" or similar)
  const lower = result.augmentedPrompt.toLowerCase();
  const inlined = result.augmentedPrompt.length > 200 &&
    (lower.includes("requirement") || lower.includes("software") || lower.includes("specification"));
  console.log("srs_body_inlined:", inlined ? "yes" : "no");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
