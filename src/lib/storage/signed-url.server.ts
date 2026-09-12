// HMAC-signed expiring URLs, replacing Supabase Storage's
// createSignedUrl/createSignedUrls. Served by
// src/routes/api/public/files.$bucket.$.ts, the one route with no JWT check
// — protected purely by the signature.
import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (!secret) throw new Error("STORAGE_SIGNING_SECRET is not set");
  return secret;
}

function sign(bucket: string, filePath: string, exp: number): string {
  return createHmac("sha256", getSecret()).update(`${bucket}:${filePath}:${exp}`).digest("hex");
}

export function signPath(bucket: string, filePath: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(bucket, filePath, exp);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `/api/public/files/${bucket}/${encodedPath}?exp=${exp}&sig=${sig}`;
}

export function signPaths(bucket: string, paths: string[], ttlSeconds: number): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of paths) map.set(p, signPath(bucket, p, ttlSeconds));
  return map;
}

export function verifySignedUrl(bucket: string, filePath: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = sign(bucket, filePath, exp);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
