export * from "./manifest.js";
export * from "./permissions.js";
export {
  encodeJsonV1,
  decodeJsonV1,
  JSON_V1_FORMAT,
  type JsonV1EncodeResult,
} from "./codecs/json-v1.js";
export {
  encodeStandardsZip,
  decodeStandardsZip,
  STANDARDS_ZIP_FORMAT,
  type StandardsZipEncodeResult,
} from "./codecs/standards-zip.js";

import type { BundleManifest } from "./manifest.js";
import { encodeJsonV1, decodeJsonV1, JSON_V1_FORMAT } from "./codecs/json-v1.js";
import { encodeStandardsZip, decodeStandardsZip, STANDARDS_ZIP_FORMAT } from "./codecs/standards-zip.js";

export type BundleFormat = typeof JSON_V1_FORMAT | typeof STANDARDS_ZIP_FORMAT;

/** Format-agnostic encode. Use for storage / transport. */
export function encodeBundle(manifest: BundleManifest, format: BundleFormat) {
  return format === STANDARDS_ZIP_FORMAT
    ? encodeStandardsZip(manifest)
    : encodeJsonV1(manifest);
}

/** Format-agnostic decode. The codec is selected from the input shape. */
export function decodeBundle(input: { format: BundleFormat; contents: string | Uint8Array }): BundleManifest {
  if (input.format === STANDARDS_ZIP_FORMAT) {
    const bytes = typeof input.contents === "string" ? new TextEncoder().encode(input.contents) : input.contents;
    return decodeStandardsZip(bytes);
  }
  return decodeJsonV1(input.contents);
}
