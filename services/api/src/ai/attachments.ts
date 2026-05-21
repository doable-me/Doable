/**
 * Attachment Processing Module
 *
 * Processes file/image attachments from the chat API before sending to the AI.
 * - Images are saved as temp files and passed via the Copilot SDK's attachments API
 * - Text and code files are inlined into the prompt
 * - PDFs are text-extracted via pdf-parse and inlined into the prompt;
 *   fallback to temp file if extraction yields empty.
 * - Documents (Word/Excel/CSV/PowerPoint) are text-extracted and inlined into the prompt
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import mammoth from "mammoth";
// Maintained SheetJS fork — the canonical `xlsx` package was de-listed from
// npm and the last published version (0.18.5) is below the CVE-2023-30533
// (prototype pollution) patch line. The @e965/xlsx API is identical.
import * as XLSX from "@e965/xlsx";
import { PDFParse } from "pdf-parse";

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

function isDocumentMime(mime: string): boolean {
  return mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "text/csv";
}

function getDocExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 * Returns "" if parsing fails (caller handles fallback).
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text || "";
  } catch (err) {
    console.error("[Attachments] pdf-parse failed:", err);
    return "";
  }
}

/**
 * Extract text from a document file buffer.
 * Supports: docx, doc (best-effort), xlsx, xls, csv, pptx
 */
async function extractDocumentText(buffer: Buffer, name: string, mime: string): Promise<string> {
  const ext = getDocExtension(name);

  // Word documents (.docx)
  if (ext === ".docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Legacy Word (.doc) — mammoth supports it too
  if (ext === ".doc" || mime === "application/msword") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return "[Could not parse .doc file — try saving as .docx]";
    }
  }

  // Excel files (.xlsx, .xls)
  if (ext === ".xlsx" || ext === ".xls" ||
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets.push(`## Sheet: ${sheetName}\n${csv}`);
    }
    return sheets.join("\n\n");
  }

  // CSV — treat as plain text
  if (ext === ".csv" || mime === "text/csv") {
    return buffer.toString("utf-8");
  }

  // PowerPoint (.pptx) — basic extraction via xlsx (it can read some OOXML)
  if (ext === ".pptx" || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    // Save as file for SDK to handle
    return "";
  }

  return "";
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
export async function processAttachments(
  attachments: RawAttachment[],
  userPrompt: string,
): Promise<AttachmentPromptAugmentation> {
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
          const buffer = Buffer.from(base64, "base64");
          const textContent = await extractPdfText(buffer);
          if (textContent && textContent.length > 0) {
            const truncated = textContent.length > MAX_TEXT_CHARS
              ? textContent.slice(0, MAX_TEXT_CHARS) + `\n... [truncated — file exceeds ${MAX_TEXT_CHARS} characters]`
              : textContent;
            fileSections.push(
              `\n\n--- Attached file: ${name} ---\n${truncated}\n--- End of ${name} ---`,
            );
            console.log(`[Attachments] Extracted PDF "${name}" (${textContent.length} chars)`);
          } else {
            // pdf-parse returned empty text (likely a scanned / image-only PDF).
            // The Copilot SDK does NOT server-side-extract PDF binaries, so forwarding
            // the raw file via fileAttachments[] is worse than useless — the model
            // would treat the binary path as opaque metadata. Drop it with an
            // explanatory note instead.
            notes.push(`\n\n[Attached PDF: ${name} — pdf-parse returned 0 chars (likely image-only/scanned). Ask the user to provide a text version or describe the contents.]`);
            console.warn(`[Attachments] PDF "${name}" yielded 0 chars from pdf-parse; not forwarding to SDK`);
          }
        } catch (err) {
          console.error(`[Attachments] Failed to process PDF "${name}":`, err);
          // Best-effort fallback: save to temp file so SDK still sees the file
          try {
            const tempPath = saveToTempFile(base64, name, mime);
            fileAttachments.push({ type: "file", path: tempPath, displayName: name });
          } catch {
            notes.push(`\n\n[Attached PDF: ${name} — failed to save for processing]`);
          }
        }
      } else {
        notes.push(`\n\n[Attached PDF: ${name} — could not decode PDF data]`);
      }
      continue;
    }

    // ── Documents (Word, Excel, CSV, PowerPoint) ──
    if (isDocumentMime(mime)) {
      const base64 = extractBase64(attachment.data);
      if (base64) {
        try {
          const buffer = Buffer.from(base64, "base64");
          const textContent = await extractDocumentText(buffer, name, mime);
          if (textContent && textContent.length > 0) {
            const truncated = textContent.length > MAX_TEXT_CHARS
              ? textContent.slice(0, MAX_TEXT_CHARS) + `\n... [truncated — file exceeds ${MAX_TEXT_CHARS} characters]`
              : textContent;
            fileSections.push(
              `\n\n--- Attached file: ${name} ---\n${truncated}\n--- End of ${name} ---`,
            );
          } else {
            // Fallback: save as temp file for SDK
            const tempPath = saveToTempFile(base64, name, mime);
            fileAttachments.push({ type: "file", path: tempPath, displayName: name });
          }
          console.log(`[Attachments] Processed document "${name}" (${textContent.length} chars)`);
        } catch (err) {
          console.error(`[Attachments] Failed to parse document "${name}":`, err);
          notes.push(`\n\n[Attached document: ${name} — failed to extract text content]`);
        }
      } else {
        notes.push(`\n\n[Attached document: ${name} — could not decode file data]`);
      }
      continue;
    }

    // ── Unknown type ──
    notes.push(
      `\n\n[Attached file: ${name} (${mime}) — this file type could not be processed for inline viewing]`,
    );
  }

  // Build the augmented prompt.
  //
  // When the user has attached documents, wrap them in unambiguous delimiters
  // and RE-ECHO the user prompt AFTER the doc block. Two reasons:
  //   1. Long attached docs (50 000-char PDF SRSes etc.) drown a short user
  //      directive at position 0; the model's last-token attention sees the
  //      tail of the PDF, not the build instruction.
  //   2. The thin "--- Attached file: <name> ---" marker was mis-classified by
  //      MiniMax / o-series models as "a tagged file" (metadata) rather than
  //      user-supplied build content. A loud === ATTACHED DOCUMENTS === fence
  //      is harder to mistake.
  //
  // No attachments → pure passthrough, no behavior change.
  const hasInlinedDocs = fileSections.length > 0;
  const docFrame = hasInlinedDocs
    ? "\n\n========== ATTACHED DOCUMENTS (use these to fulfill the user's request) =========="
      + fileSections.join("")
      + "\n========== END OF ATTACHED DOCUMENTS =========="
      + "\n\n========== USER REQUEST (REPEATED — execute this against the documents above) =========="
      + `\n${userPrompt}`
      + "\n========== END OF USER REQUEST =========="
    : "";
  const augmentedPrompt = userPrompt + docFrame + notes.join("");

  return { augmentedPrompt, fileAttachments };
}
