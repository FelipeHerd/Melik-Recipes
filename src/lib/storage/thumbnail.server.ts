// Pre-generated thumbnails, replacing Supabase Storage's on-the-fly
// `createSignedUrl(path, ttl, { transform })`. Local disk has no live
// transform API, so thumbnails are generated once at upload time and stored
// alongside the original (see recipes.functions.ts's uploadRecipeImage).
import sharp from "sharp";

export type ThumbnailPreset = { width: number; height: number; quality: number };

export async function generateThumbnail(data: Buffer, preset: ThumbnailPreset): Promise<Buffer> {
  return sharp(data)
    .resize(preset.width, preset.height, { fit: "cover" })
    .jpeg({ quality: preset.quality })
    .toBuffer();
}

/** Deterministic thumbnail path for an original — e.g.
 *  `{userId}/{uuid}.jpg` + {width:640,height:400,quality:70} =>
 *  `thumbs/{userId}/{uuid}_640x400_q70.jpg`. */
export function thumbnailPath(originalPath: string, preset: ThumbnailPreset): string {
  const lastSlash = originalPath.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : originalPath.slice(0, lastSlash);
  const filename = lastSlash === -1 ? originalPath : originalPath.slice(lastSlash + 1);
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  const suffix = `${preset.width}x${preset.height}_q${preset.quality}`;
  return dir ? `thumbs/${dir}/${base}_${suffix}.jpg` : `thumbs/${base}_${suffix}.jpg`;
}
