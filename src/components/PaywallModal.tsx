import { useNavigate } from "@tanstack/react-router";
import { Crown, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { useModalA11y } from "@/hooks/use-modal-a11y";

/**
 * Guest-aware paywall.
 * - Invitado → CTA "Crear cuenta para suscribirse" → /auth
 * - Logueado no premium → CTA "Suscribirme" (toast "Próximamente")
 */
export function PaywallModal({
  open,
  onClose,
  isAuthenticated,
  recipeTitle,
}: {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  recipeTitle?: string;
}) {
  const navigate = useNavigate();
  useModalA11y(open ? onClose : () => {});
  if (!open) return null;

  const cta = isAuthenticated ? "Suscribirme" : "Crear cuenta para suscribirse";

  const onCta = () => {
    if (!isAuthenticated) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    toast.info("Próximamente", {
      description: "Las suscripciones Melik+ estarán disponibles muy pronto.",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-[color:var(--background)] shadow-2xl animate-enter sm:rounded-3xl"
      >
        <button
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-card text-foreground/70 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="px-8 pb-8 pt-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Crown className="h-8 w-8" />
          </div>
          <h2 id="paywall-title" className="mt-4 font-display text-2xl font-semibold">
            Receta exclusiva Melik+
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {recipeTitle ? <>«{recipeTitle}» es</> : "Esta receta es"} parte del catálogo premium de la Melik Bakery. Suscríbete para desbloquear todas las recetas oficiales, pasos ilustrados y actualizaciones semanales.
          </p>

          <ul className="mt-5 space-y-2 text-left text-sm text-foreground/80">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Lock className="h-3 w-3" />
              </span>
              Acceso completo a recetas oficiales de la panadería.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Crown className="h-3 w-3" />
              </span>
              Calculadora panadera profesional y pasos con foto.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Crown className="h-3 w-3" />
              </span>
              5% de descuento en todas las compras que hagas.
            </li>
          </ul>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onCta}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Crown className="h-4 w-4" /> {cta}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-card px-5 text-sm font-medium text-foreground/80 hover:bg-card/70"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
