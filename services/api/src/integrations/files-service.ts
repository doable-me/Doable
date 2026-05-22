import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PUBLIC_URL = process.env.PUBLIC_URL ?? process.env.API_URL ?? "http://127.0.0.1:4000";

/**
 * File service for integration actions that need to read/write files.
 * Implements the Activepieces FilesService interface.
 * Stores files in a local directory and returns a public URL.
 */
export class DoableFilesService {
  async write({ fileName, data }: { fileName: string; data: Buffer }): Promise<string> {
    const dir = path.join(DATA_DIR, "integration-files");
    await fs.mkdir(dir, { recursive: true });
    const id = crypto.randomUUID();
    const ext = path.extname(fileName) || "";
    const filePath = path.join(dir, `${id}${ext}`);
    await fs.writeFile(filePath, data);
    return `${PUBLIC_URL}/files/integration/${id}${ext}`;
  }
}
