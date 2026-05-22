/**
 * Minimal ZIP file builder using only Node.js built-in zlib.
 *
 * Creates a valid ZIP archive from an array of { path, content } entries.
 * Supports deflate compression via zlib.deflateRawSync.
 *
 * This avoids adding an external dependency like `archiver` or `jszip`.
 */

import { deflateRawSync } from "node:zlib";

interface ZipEntry {
  path: string;
  content: Buffer;
}

/**
 * Build a ZIP file buffer from file entries.
 */
export function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.path, "utf-8");
    const uncompressedData = entry.content;
    const compressedData = deflateRawSync(uncompressedData);
    const crc = crc32(uncompressedData);

    // Local file header (30 bytes + filename + compressed data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method (8 = deflate)
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    const localEntry = Buffer.concat([localHeader, nameBuffer, compressedData]);
    localHeaders.push(localEntry);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(8, 10); // Compression method (deflate)
    centralHeader.writeUInt16LE(0, 12); // Last mod file time
    centralHeader.writeUInt16LE(0, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralHeaders.push(Buffer.concat([centralHeader, nameBuffer]));

    offset += localEntry.length;
  }

  // End of central directory record
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  endRecord.writeUInt16LE(0, 4); // Disk number
  endRecord.writeUInt16LE(0, 6); // Disk where central dir starts
  endRecord.writeUInt16LE(entries.length, 8); // Number of entries on this disk
  endRecord.writeUInt16LE(entries.length, 10); // Total number of entries
  endRecord.writeUInt32LE(centralDirSize, 12); // Size of central directory
  endRecord.writeUInt32LE(offset, 16); // Offset of start of central directory
  endRecord.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

// ─── CRC-32 ───────────────────────────────────────────────

const crcTable = makeCrcTable();

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
