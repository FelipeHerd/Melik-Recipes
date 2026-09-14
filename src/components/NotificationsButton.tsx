import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useSessionUser } from "@/lib/auth/session-store";
import { getMyUnreadNotificationsCount } from "@/lib/admin.functions";

// Hook interno: user id actual + refresco del contador de no leídas.
// QueryKey scoped por userId para evitar fuga de cache entre sesiones.
// TODO(realtime phase): swap refetchInterval for a WebSocket push
// (src/lib/realtime/ws-client.ts) — see migration plan Section 3.7.
function useUnreadNotifications(): { count: number; enabled: boolean } {
  const { userId } = useSessionUser();

  const fetchCount = useServerFn(
    getMyUnreadNotificationsCount as unknown as typeof getMyUnreadNotificationsCount,
  );
  const { data } = useQuery({
    queryKey: ["notifications", "unreadCount", userId],
    queryFn: () => fetchCount() as unknown as Promise<{ count: number }>,
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  return { count: data?.count ?? 0, enabled: !!userId };
}

// Botón único para acceder a la vista de notificaciones.
// - En móvil se coloca dentro del header, a la izquierda del avatar.
// - En desktop/tablet se posiciona flotante en la esquina superior derecha
//   desde __root.tsx (fuera del sidebar).
//
// Indicador de no leídas: mismo punto primario que se muestra junto a cada
// notificación no leída en `/notificaciones` (consistencia visual). El conteo
// exacto se mantiene en el `aria-label` para lectores de pantalla.
export function NotificationsButton({
  variant = "inline",
  active = false,
}: {
  variant?: "inline" | "floating";
  active?: boolean;
}) {
  const { count, enabled } = useUnreadNotifications();
  const showDot = enabled && count > 0;
  const ariaLabel = showDot ? `Notificaciones (${count} sin leer)` : "Notificaciones";

  if (variant === "floating") {
    return (
      <Link
        to="/notificaciones"
        aria-label={ariaLabel}
        className="fixed right-5 top-5 z-30 hidden md:grid h-11 w-11 place-items-center rounded-2xl border border-border/60 bg-background/80 text-foreground/80 backdrop-blur hover:bg-card hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {showDot && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </Link>
    );
  }

  return (
    <Link
      to="/notificaciones"
      aria-label={ariaLabel}
      className={`relative grid h-11 w-11 place-items-center rounded-xl text-foreground/80 hover:bg-card hover:text-foreground transition-colors ${
        active ? "bg-primary/10 text-primary" : ""
      }`}
    >
      {active && (
        <span className="absolute inset-0 rounded-xl ring-2 ring-primary animate-in fade-in zoom-in-95 duration-300" />
      )}
      <Bell className="h-5 w-5" />
      {showDot && (
        <span
          aria-hidden
          className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </Link>
  );
}
