// Shown when the daily voice budget runs out (before or mid-call).
import { Link } from "@tanstack/react-router";
import { Crown, Timer } from "lucide-react";
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

export function VoiceLimitModal({
  open,
  onOpenChange,
  isPremium,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isPremium: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="mx-auto mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--ochre)]/20 text-[color:var(--ochre)]">
            {isPremium ? <Timer className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
          </span>
          <AlertDialogTitle className="text-center">
            {isPremium ? "Alcanzaste tus 15 minutos de hoy" : "Alcanzaste tu minuto diario"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {isPremium
              ? "Tu tiempo de voz con Kiko se renueva mañana a medianoche. Mientras tanto puedes seguir escribiéndole por texto."
              : "Con el plan gratuito tienes 1 minuto de voz al día para probar a Kiko. Con Melik+ hablas hasta 15 minutos diarios."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Entendido</AlertDialogCancel>
          {!isPremium && (
            <AlertDialogAction asChild>
              <Link to="/melik-plus" className="inline-flex items-center gap-2">
                <Crown className="h-4 w-4" /> Ver Melik+
              </Link>
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
