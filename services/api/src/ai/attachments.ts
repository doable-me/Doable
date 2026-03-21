/**
 * Attachment Processing Module
 *
 * Processes file/image attachments from the chat API before sending to the AI.
 * - Images are saved as temp files and passed via the Copilot SDK's attachments API
 * - Text and code files are inlined into the prompt
 * - PDFs are saved as temp files for the SDK to read
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// ─── Types ──────────────────────────────────────────────

export interface AttachmentPromptAugmentation {
  /** Prompt with file contents appended / attachment notes included */
  augmentedPrompt: string;
  /** File paths for the Copilot SDK's attachments option ({ type: "file", path }) */
  fileAttachments: Array<{ type: "file"; path: string; displayName?: string }>;
}

/** Raw attachment shape coming from the API request schema */
interface RawAttachment {
  type: string;
  data: string;
  name: string;
}

// ─── Constants ──────────────────────────────────────────

const MAX_TEXT_CHARS = 50_000;

/** MIME types treated as text / code (beyond "text/*") */
const CODE_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/xhtml+xml",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/x-sh",
  "application/x-shellscript",
  "application/sql",
  "application/graphql",
  "application/x-httpd-php",
  "application/x-python-code",
]);

// ─── Temp directory for attachment files ─────────────────

const TEMP_DIR = join(tmpdir(), "doable-attachments");

function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

// ─── Helpers ────────────────────────────────────────────

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isTextOrCodeMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (CODE_MIME_TYPES.has(mime)) return true;
  return false;
}

function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

/**
 * Extract base64 payload from a data URL.
 * Handles "data:image/png;base64,AAAA..." format.
 */
function extractBase64(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s);
  if (match && match[1]) {
    return match[1];
  }
  // If it doesn't look like a data URL but is long, treat as raw base64
  if (!dataUrl.startsWith("data:") && dataUrl.length > 100) {
    return dataUrl;
  }
  return null;
}

/**
 * Get file extension from MIME type
 */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "application/pdf": ".pdf",
  };
  return map[mime] ?? ".bin";
}

/**
 * Save base64 data to a temp file and return the path.
 */
function saveToTempFile(base64Data: string, name: string, mime: string): string {
  ensureTempDir();
  const ext = extFromMime(mime);
  // Use original name if it has an extension, otherwise generate one
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${randomUUID()}_${safeName}${safeName.includes(".") ? "" : ext}`;
  const filePath = join(TEMP_DIR, filename);
  const buffer = Buffer.from(base64Data, "base64");
  writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Main ───────────────────────────────────────────────

/**
 * Process raw attachments from the chat API request and produce:
 * - An augmented prompt with text/code content inlined
 * - File paths for images/PDFs to pass to the Copilot SDK's attachments API
 */
export function processAttachments(
  attachments: RawAttachment[],
  userPrompt: string,
): AttachmentPromptAugmentation {
  const fileAttachments: AttachmentPromptAugmentation["fileAttachments"] = [];
  const fileSections: string[] = [];
  const notes: string[] = [];

  for (const attachment of attachments) {
    const mime = attachment.type || "application/octet-stream";
    const name = attachment.name || "unnamed";

    // ── Images ──
    if (isImageMime(mime)) {
      const base64 = extractBase64(attachment.data);
      if (base64) {
        try {
          const tempPath = saveToTempFile(base64, name, mime);
          fileAttachments.push({ type: "file", path: tempPath, displayName: name });
          console.log(`[Attachments] Saved image "${name}" to ${tempPath}`);
        } catch (err) {
          console.error(`[Attachments] Failed to save image "${name}":`, err);
          notes.push(`\n\n[Attached image: ${name} — failed to save for processing]`);
        }
      } else {
        notes.push(`\n\n[Attached image: ${name} — could not decode image data]`);
      }
      continue;
    }

    // ── Text / Code ──
    if (isTextOrCodeMime(mime)) {
      let textContent = attachment.data;
      // If the data is a data URL, strip the prefix to get raw text
      if (textContent.startsWith("data:")) {
        const commaIdx = textContent.indexOf(",");
        if (commaIdx !== -1) {
          const afterComma = textContent.slice(commaIdx + 1);
          if (textContent.includes(";base64,")) {
            try {
              textContent = Buffer.from(afterComma, "base64").toString("utf-8");
            } catch {
              textContent = afterComma;
            }
          } else {
            textContent = decodeURIComponent(afterComma);
          }
        }
      }

      // Truncate if too long
      if (textContent.length > MAX_TEXT_CHARS) {
        textContent = textContent.slice(0, MAX_TEXT_CHARS) + `\n... [truncated — file exceeds ${MAX_TEXT_CHARS} characters]`;
      }

      fileSections.push(
        `\n\n--- Attached file: ${name} ---\n${textContent}\n--- End of ${name} ---`,
      );
      continue;
    }

    // ── PDFs ──
    if (isPdfMime(mime)) {
      const base64 = extractBase64(attachment.data);
      if (base64) {
        try {
          const tempPath = saveToTempFile(base64, name, mime);
          fileAttachments.push({ type: "file", path: tempPath, displayName: name });
          console.log(`[Attachments] Saved PDF "${name}" to ${tempPath}`);
        } catch (err) {
          console.error(`[Attachments] Failed to save PDF "${name}":`, err);
          notes.push(`\n\n[Attached PDF: ${name} — failed to save for processing]`);
        }
      } else {
        notes.push(`\n\n[Attached PDF: ${name} — could not decode PDF data]`);
      }
      continue;
    }

    // ── Unknown type ──
    notes.push(
      `\n\n[Attached file: ${name} (${mime}) — this file type could not be processed for inline viewing]`,
    );
  }

  // Build the augmented prompt:
  // original message → file content sections → notes
  const augmentedPrompt = userPrompt + fileSections.join("") + notes.join("");

  return { augmentedPrompt, fileAttachments };
}
