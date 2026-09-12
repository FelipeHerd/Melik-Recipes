// Avatar upload — moved server-side (the old client used the Supabase
// browser client directly for storage.upload + createSignedUrl + a profile
// update; there's no browser DB/storage client anymore, so all three steps
// now happen in one authenticated server function).
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";

const AVATAR_BUCKET = "avatars";
const AVATAR_TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5 years
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("APP-DATA-001: FormData expected");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("APP-FILE-003: file missing");
    if (!file.type.startsWith("image/")) throw new Error("APP-FILE-001: avatar mime");
    if (file.size > MAX_AVATAR_BYTES) throw new Error("APP-FILE-002: avatar >10MB");
    return { file };
  })
  .handler(async ({ data, context }): Promise<{ avatarUrl: string }> => {
    const { saveFile } = await import("@/lib/storage/local-storage.server");
    const { signPath } = await import("@/lib/storage/signed-url.server");
    const { db } = await import("@/lib/db.server");

    const path = `avatar_${context.userId}.jpg`;
    const buffer = Buffer.from(await data.file.arrayBuffer());
    await saveFile(AVATAR_BUCKET, path, buffer);

    const signedUrl = signPath(AVATAR_BUCKET, path, AVATAR_TTL_SECONDS);
    // Cache-bust: the path is fixed (upsert semantics), so append a
    // timestamp query param to force the browser to refetch the new image.
    const avatarUrl = `${signedUrl}&t=${Date.now()}`;

    await db.updateTable("profiles").set({ avatar_url: avatarUrl }).where("id", "=", context.userId).execute();
    return { avatarUrl };
  });
