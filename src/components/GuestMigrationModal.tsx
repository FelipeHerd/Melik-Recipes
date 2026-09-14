import { useState } from "react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { CloudUpload, X } from "lucide-react";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { useRecipes } from "@/lib/recipes-context";

const NOOP_CLOSE = () => {
  /* Intentionally do NOT close on Escape — force explicit choice */
};

export function GuestMigrationModal() {
  const { pendingGuestMigration, confirmMigration, discardMigration } = useRecipes();
  const [busy, setBusy] = useState(false);
  const hasPendingMigration = !!pendingGuestMigration && pendingGuestMigration.length > 0;

  useModalA11y(NOOP_CLOSE, hasPendingMigration);

  if (!hasPendingMigration) return null;
  const count = pendingGuestMigration.length;

  const onConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const inserted = await confirmMigration();
      toast.success(`Se importaron ${inserted} recetas a tu cuenta`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    if (busy) return;
    discardMigration();
    toast.message("Recetas de invitado descartadas");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-migration-title"
        className="relative w-full max-w-md rounded-t-3xl bg-background p-6 shadow-2xl animate-enter sm:rounded-3xl sm:p-8"
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <CloudUpload className="h-6 w-6" />
        </div>
        <h2 id="guest-migration-title" className="mt-4 font-display text-2xl font-semibold">
          Importar tus recetas
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Detectamos{" "}
          <strong>
            {count} {count === 1 ? "receta guardada" : "recetas guardadas"}
          </strong>{" "}
          como invitado en este dispositivo. ¿Quieres importarlas a tu cuenta para tenerlas siempre
          disponibles?
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="h-11 rounded-xl px-5 text-sm font-medium text-foreground/70 hover:bg-card disabled:opacity-50"
          >
            No, descartar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Importando…" : `Sí, importar (${count})`}
          </button>
        </div>
        {/* Non-functional X to hint dismissal path */}
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          aria-label="Descartar recetas de invitado"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-foreground/50 hover:bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
