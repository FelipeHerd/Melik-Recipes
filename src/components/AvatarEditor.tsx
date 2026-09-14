import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, Image as ImageIcon, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { useQueryClient } from "@tanstack/react-query";
import { uploadAvatar } from "@/lib/avatar.functions";
import { useModalA11y } from "@/hooks/use-modal-a11y";

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const size = Math.min(1024, Math.max(256, Math.round(area.width)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No blob"))), "image/jpeg", 0.9);
  });
}

interface Props {
  userId: string;
  avatarUrl: string | null;
  initials: string;
}

export function AvatarEditor({ userId, avatarUrl, initials }: Props) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    setMenuOpen(false);
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError(new Error("APP-FILE-001: avatar mime"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError(new Error("APP-FILE-002: avatar >10MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function handleConfirmCrop(area: Area) {
    setUploading(true);
    try {
      const blob = await getCroppedBlob(cropSrc!, area);
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      await uploadAvatar({ data: fd });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Foto de perfil actualizada");
      setCropSrc(null);
    } catch (err) {
      showError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="relative h-20 w-20 shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Editar foto de perfil"
          className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl bg-primary text-2xl font-semibold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Cambiar foto de perfil"
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-md hover:opacity-90"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      {menuOpen && (
        <ActionSheet
          onClose={() => setMenuOpen(false)}
          canView={!!avatarUrl}
          onView={() => {
            setMenuOpen(false);
            setViewOpen(true);
          }}
          onChange={openFilePicker}
        />
      )}

      {viewOpen && avatarUrl && (
        <ViewPhotoModal src={avatarUrl} onClose={() => setViewOpen(false)} />
      )}

      {cropSrc && (
        <CropModal
          src={cropSrc}
          uploading={uploading}
          onCancel={() => (uploading ? null : setCropSrc(null))}
          onConfirm={handleConfirmCrop}
        />
      )}
    </>
  );
}

function ActionSheet({
  onClose,
  onView,
  onChange,
  canView,
}: {
  onClose: () => void;
  onView: () => void;
  onChange: () => void;
  canView: boolean;
}) {
  useModalA11y(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-t-3xl bg-background p-4 shadow-2xl animate-enter sm:rounded-3xl sm:p-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="grid gap-2">
          <button
            type="button"
            onClick={onView}
            disabled={!canView}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium disabled:opacity-50 hover:bg-card/70"
          >
            <ImageIcon className="h-4 w-4" /> Ver foto
          </button>
          <button
            type="button"
            onClick={onChange}
            className="flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Camera className="h-4 w-4" /> Cambiar foto
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-2xl border border-border px-4 py-3 text-sm font-medium hover:bg-card"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewPhotoModal({ src, onClose }: { src: string; onClose: () => void }) {
  useModalA11y(onClose);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt="Foto de perfil"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
      />
    </div>
  );
}

function CropModal({
  src,
  uploading,
  onCancel,
  onConfirm,
}: {
  src: string;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: (area: Area) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    // Prevent background scroll while cropping
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onCropComplete = useCallback((_c: Area, cropped: Area) => {
    setArea(cropped);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={1}
          maxZoom={4}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="flex items-center justify-between gap-3 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          className="h-11 flex-1 rounded-2xl border border-border text-sm font-medium hover:bg-card disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => area && onConfirm(area)}
          disabled={uploading || !area}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {uploading ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
