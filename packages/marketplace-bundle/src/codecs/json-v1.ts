import { bundleManifestSchema, type BundleManifest } from "../manifest.js";

/**
 * Doable JSON v1 codec — direct JSON serialisation of the manifest.
 *
 * Pros: trivial, transport-friendly (REST/JSON), small bundles.
 * Cons: not a recognised industry format; large knowledge files balloon.
 *
 * Use Standards Zip v1 when interop with Cursor / Claude Code matters.
 */
export const JSON_V1_FORMAT = "doable.json.v1" as const;

export interface JsonV1EncodeResult {
  format: typeof JSON_V1_FORMAT;
  /** Stringified JSON, ready to store/send over the wire. */
  contents: string;
  byteLength: number;
}

export function encodeJsonV1(manifest: BundleManifest): JsonV1EncodeResult {
  const stamped: BundleManifest = { ...manifest, format: JSON_V1_FORMAT };
  const contents = JSON.stringify(stamped);
  return {
    format: JSON_V1_FORMAT,
    contents,
    byteLength: byteLengthOf(contents),
  };
}

export function decodeJsonV1(input: string | Uint8Array): BundleManifest {
  const text = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  const parsed = JSON.parse(text);
  return bundleManifestSchema.parse(parsed);
}

function byteLengthOf(s: string): number {
  // TextEncoder is available in Node 18+ and all modern browsers.
  return new TextEncoder().encode(s).byteLength;
}
