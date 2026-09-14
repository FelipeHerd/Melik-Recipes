// Local-disk replacement for Supabase Storage. Files live under
// `UPLOADS_DIR/{bucket}/{path}` on a Docker volume (see docker-compose.yml).
// Access is never direct filesystem/URL — always through a signed URL
// (signed-url.server.ts) served by src/routes/api/public/files.$bucket.$.ts.
import {
  mkdir,
  readFile as fsReadFile,
  rm,
  writeFile,
  copyFile as fsCopyFile,
  access,
} from "node:fs/promises";
import path from "node:path";

function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? "./data/uploads";
}

function resolvePath(bucket: string, filePath: string): string {
  // Buckets and paths are always server-generated (uuid-based) or validated
  // upstream (recipes.functions.ts, etc.) — never taken verbatim from an
  // unauthenticated request — but normalize defensively against traversal.
  const safeBucket = bucket.replace(/[^a-z0-9-]/gi, "");
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(uploadsRoot(), safeBucket, safePath);
}

export async function saveFile(bucket: string, filePath: string, data: Buffer): Promise<void> {
  const dest = resolvePath(bucket, filePath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, data);
}

export async function readFile(bucket: string, filePath: string): Promise<Buffer> {
  return fsReadFile(resolvePath(bucket, filePath));
}

export async function deleteFile(bucket: string, filePath: string): Promise<void> {
  await rm(resolvePath(bucket, filePath), { force: true });
}

export async function copyFile(bucket: string, fromPath: string, toPath: string): Promise<void> {
  const dest = resolvePath(bucket, toPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await fsCopyFile(resolvePath(bucket, fromPath), dest);
}

export async function fileExists(bucket: string, filePath: string): Promise<boolean> {
  try {
    await access(resolvePath(bucket, filePath));
    return true;
  } catch {
    return false;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function mimeTypeForPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
