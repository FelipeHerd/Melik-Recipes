// Unified composer attach button: one "+" opens a menu with camera, gallery
// and "Attach recipe" — no separate icons in the composer.
import { useEffect, useId, useRef, useState } from "react";
import { Plus, Camera, ImageIcon, BookOpen } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { compressImage, type AttachedImage } from "@/components/ChatImageAttach";
import { RecipePickerModal } from "@/components/RecipePickerModal";
import type { AttachedRecipe } from "@/lib/recipe-context";

export function ChatAttachMenu({
  onImage,
  onRecipe,
  disabled,
}: {
  onImage: (img: AttachedImage) => void;
  onRecipe: (r: AttachedRecipe) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
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
      onImage(img);
    } catch {
      showError(new Error("APP-FILE-003: chat compress"));
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setOpen(false);
    void handleFile(f);
  };

  return (
    <>
      <div ref={rootRef} className="relative inline-flex">
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-label="Adjuntar"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          className="grid h-11 w-11 flex-none place-items-center rounded-2xl text-foreground/60 hover:bg-card hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>

        {open && (
          <div
            id={id}
            role="menu"
            className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1 text-sm shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => cameraRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
            >
              <Camera className="h-4 w-4" /> Tomar foto
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => galleryRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
            >
              <ImageIcon className="h-4 w-4" /> Elegir de galería
            </button>
            <div className="my-1 h-px bg-border/60" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPicker(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpen className="h-4 w-4" /> Adjuntar receta
            </button>
          </div>
        )}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFileChange}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFileChange}
        />
      </div>

      {picker && (
        <RecipePickerModal
          onClose={() => setPicker(false)}
          onSelect={(r) => {
            setPicker(false);
            onRecipe(r);
          }}
        />
      )}
    </>
  );
}
