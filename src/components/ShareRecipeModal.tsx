import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, X, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { generateShareToken } from "@/lib/share.functions";
import melikLogo from "@/assets/melik-logo.png.asset.json";

export function ShareRecipeModal({
  recipeId,
  recipeTitle,
  onClose,
}: {
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
}) {
  useModalA11y(onClose);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    generateShareToken({ data: { recipeId } })
      .then((res) => {
        if (!cancelled) setToken(res.token);
      })
      .catch((err) => {
        showError(err);
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, onClose]);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${token}`
    : "";

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      showError(err, "APP-SHARE-001");
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `Receta: ${recipeTitle}`,
          text: `Mira esta receta: ${recipeTitle}`,
          url: shareUrl,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-recipe-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[color:var(--background)] p-6 shadow-2xl animate-enter sm:rounded-3xl"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl bg-background text-foreground/70 hover:bg-card"
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--ochre)]">
            Compartir receta
          </p>
          <h2 id="share-recipe-title" className="mt-1 font-display text-2xl font-semibold leading-tight">
            {recipeTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cualquiera con este enlace o QR podrá añadir una copia a su propio recetario.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : token ? (
          <>
            <div className="mt-6 grid place-items-center rounded-2xl bg-white p-5">
              <div className="relative">
                <QRCodeCanvas value={shareUrl} size={220} includeMargin={false} level="H" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-[color:var(--ochre)] shadow-md"
                  style={{ borderRadius: "22%" }}
                >
                  <img
                    src={melikLogo.url}
                    alt=""
                    className="h-[85%] w-[85%] object-contain"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Enlace
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copiar enlace"
                  className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border bg-card hover:bg-background"
                >
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={nativeShare}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Share2 className="h-4 w-4" /> Compartir
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
