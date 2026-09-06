// Reusable image picker that lets the user pick from gallery or take a photo
// with the device camera. Renders a custom trigger and a small popover menu
// with two hidden <input type="file"> elements (one has `capture` for camera).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Camera, ImageIcon } from "lucide-react";

export function ImagePickerButton({
  onFile,
  disabled,
  children,
  className,
  ariaLabel = "Añadir imagen",
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
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

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setOpen(false);
    if (f) onFile(f);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        className={className}
      >
        {children}
      </button>

      {open && (
        <div
          id={id}
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-44 overflow-hidden rounded-2xl border border-border bg-popover p-1 text-sm shadow-lg"
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
        </div>
      )}

      {/* Hidden inputs — sr-only keeps them focusable/clickable across browsers. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handle}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handle}
      />
    </div>
  );
}
