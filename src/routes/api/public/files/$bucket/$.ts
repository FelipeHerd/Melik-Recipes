// Serves locally-stored files (replacing Supabase Storage's public/signed
// URLs). The ONLY public route with no JWT check — protected purely by the
// HMAC signature in the query string (see signed-url.server.ts). Path shape:
// /api/public/files/{bucket}/{...path}?exp={unix}&sig={hex}
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/files/$bucket/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { verifySignedUrl } = await import("@/lib/storage/signed-url.server");
        const { readFile, mimeTypeForPath } = await import("@/lib/storage/local-storage.server");

        const bucket = params.bucket;
        const filePath = params._splat ?? "";
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp"));
        const sig = url.searchParams.get("sig") ?? "";

        if (!bucket || !filePath || !verifySignedUrl(bucket, filePath, exp, sig)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const data = await readFile(bucket, filePath);
          return new Response(new Uint8Array(data), {
            headers: {
              "Content-Type": mimeTypeForPath(filePath),
              "Cache-Control": "private, max-age=604800, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
