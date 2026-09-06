import { Link } from "@tanstack/react-router";
import { Crown, Mic, Volume2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function KikoVoicePaywallModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
        <AlertDialogHeader className="items-center text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--ochre)]/15 text-[color:var(--ochre)] shadow-sm">
            <Mic className="h-7 w-7" />
          </div>
          <AlertDialogTitle className="font-display text-2xl font-semibold text-foreground">
            Habla con Kiko con Melik+
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
            La interacción por voz en tiempo real con Kiko es una función exclusiva de{" "}
            <span className="font-semibold text-foreground">Melik+</span>. Cocina con las manos libres mientras Kiko te guía paso a paso por tus recetas.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 space-y-2.5 rounded-2xl bg-card/60 p-4 border border-border/50 text-left text-xs text-foreground/80">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Mic className="h-3.5 w-3.5" />
            </span>
            <span>Asistente por voz en tiempo real con inteligencia artificial</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Volume2 className="h-3.5 w-3.5" />
            </span>
            <span>Guía paso a paso con manos libres mientras cocinas</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Crown className="h-3.5 w-3.5" />
            </span>
            <span>Hasta 15 minutos diarios de llamada de voz con Kiko</span>
          </div>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction asChild className="w-full">
            <Link
              to="/melik-plus"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90"
            >
              <Crown className="h-4 w-4" /> Desbloquear Melik+
            </Link>
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
            className="mt-0 h-10 w-full rounded-xl border-border bg-background text-sm font-medium text-foreground/70 hover:bg-card hover:text-foreground"
          >
            Ahora no
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
