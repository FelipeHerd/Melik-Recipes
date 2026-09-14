import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Html5Qrcode } from "html5-qrcode";
import { useModalA11y } from "@/hooks/use-modal-a11y";

// UUID (v4-ish) matcher for scanned tokens or full share URLs.
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function QrScannerModal({ onClose }: { onClose: () => void }) {
  useModalA11y(onClose);
  const navigate = useNavigate();
  const containerId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(containerId, { verbose: false });
    scannerRef.current = scanner;

    const onScan = (decoded: string) => {
      if (handledRef.current) return;
      const match = decoded.match(UUID_RE);
      if (!match) return;
      handledRef.current = true;
      const token = match[1].toLowerCase();
      // Stop the camera before navigating away.
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          navigate({
            to: "/shared/$shareToken",
            params: { shareToken: token },
          });
          onClose();
        });
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onScan,
        () => {
          /* per-frame decode misses — ignore */
        },
      )
      .then(() => {
        if (cancelled) return;
        setStatus("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name?: unknown }).name ?? "")
            : "";
        const msg = err instanceof Error ? err.message : String(err);
        const denied =
          name === "NotAllowedError" ||
          name === "PermissionDeniedError" ||
          /permission|denied|NotAllowed/i.test(msg);
        const notFound =
          name === "NotFoundError" ||
          name === "DevicesNotFoundError" ||
          name === "OverconstrainedError";
        if (denied) {
          setStatus("denied");
        } else if (notFound) {
          setErrorMsg(
            "No encontramos ninguna cámara. Conecta una o prueba desde otro dispositivo.",
          );
          setStatus("error");
        } else {
          setErrorMsg("No pudimos iniciar la cámara. Vuelve a intentarlo.");
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst) {
        inst
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              inst.clear();
            } catch {
              /* noop */
            }
          });
      }
    };
  }, [navigate, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[color:var(--background)] shadow-2xl animate-enter sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--ochre)]">
              Escanear
            </p>
            <h2 id="qr-scanner-title" className="font-display text-lg font-semibold">
              Añadir receta por QR
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-xl bg-card text-foreground/70 hover:bg-background"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <div
            id={containerId}
            className="aspect-square w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
          />
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {status === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center">
              <Camera className="h-8 w-8 text-muted-foreground" />
              <p className="font-display text-lg font-semibold">Permiso requerido</p>
              <p className="text-sm text-muted-foreground">
                Activa la cámara desde los ajustes del navegador para escanear códigos QR.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-medium hover:bg-background"
              >
                Cancelar
              </button>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center">
              <p className="font-display text-lg font-semibold">No se pudo iniciar la cámara</p>
              {errorMsg && <p className="text-sm text-muted-foreground break-words">{errorMsg}</p>}
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-medium hover:bg-background"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {status === "scanning" && (
          <p className="px-5 py-4 text-center text-sm text-muted-foreground">
            Apunta al código QR de la receta compartida.
          </p>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- shared helper colocated with the component that uses it
export function extractShareToken(input: string): string | null {
  const m = input.match(UUID_RE);
  return m ? m[1].toLowerCase() : null;
}
