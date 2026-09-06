import { Paperclip, X } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { ImagePickerButton } from "@/components/ImagePickerButton";

export type AttachedImage = { base64: string; mime: string; previewUrl: string };

export async function compressImage(file: File): Promise<AttachedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read error"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("img load"));
    i.src = dataUrl;
  });
  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas ctx");
  ctx.drawImage(img, 0, 0, w, h);
  const mime = "image/jpeg";
  const out = canvas.toDataURL(mime, 0.8);
  return { base64: out, mime, previewUrl: out };
}

/**
 * Legacy standalone attach — kept for compatibility but deprecated in favor of
 * ChatAttachMenu, which groups image + recipe attachments under a single "+".
 */
export function ChatImageAttach({
  attached,
  onChange,
  disabled,
}: {
  attached: AttachedImage | null;
  onChange: (img: AttachedImage | null) => void;
  disabled?: boolean;
}) {
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      showError(new Error("APP-FILE-001: chat mime"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showError(new Error("APP-FILE-002: chat >8MB"));
      return;
    }
    try {
      const img = await compressImage(file);
      onChange(img);
    } catch {
      showError(new Error("APP-FILE-003: chat compress"));
    }
  }

  return (
    <>
      <ImagePickerButton
        onFile={handleFile}
        disabled={disabled}
        ariaLabel="Adjuntar imagen"
        className="grid h-11 w-11 flex-none place-items-center rounded-2xl text-foreground/60 hover:bg-card hover:text-foreground disabled:opacity-40"
      >
        <Paperclip className="h-5 w-5" />
      </ImagePickerButton>
      {attached && (
        <div className="absolute -top-16 left-2 flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-lg">
          <img src={attached.previewUrl} alt="" loading="lazy" decoding="async" className="h-12 w-12 rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-7 w-7 place-items-center rounded-full bg-card hover:bg-muted"
            aria-label="Quitar imagen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
