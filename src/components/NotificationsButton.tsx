import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyUnreadNotificationsCount } from "@/lib/admin.functions";

// Hook interno: user id actual + suscripción realtime a `notifications`.
// - QueryKey scoped por userId para evitar fuga de cache entre sesiones.
// - Canal realtime con nombre único por instancia (soporta múltiples botones
//   montados: header móvil + floating desktop) y cleanup asíncrono.
function useUnreadNotifications(): { count: number; enabled: boolean } {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fetchCount = useServerFn(getMyUnreadNotificationsCount as unknown as typeof getMyUnreadNotificationsCount);
  const { data } = useQuery({
    queryKey: ["notifications", "unreadCount", userId],
    queryFn: () => fetchCount() as unknown as Promise<{ count: number }>,
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!userId) return;
    // Nombre único: evita colisión si hay dos instancias del botón montadas.
    const channelName = `notifications:${userId}:${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    }`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          // Invalida sólo lo scoped a este userId, no todo "notifications".
          qc.invalidateQueries({ queryKey: ["notifications", "unreadCount", userId] });
          qc.invalidateQueries({ queryKey: ["notifications", "mine", userId] });
        },
      )
      .subscribe();
    return () => {
      // Cleanup asíncrono: asegura unsubscribe antes de que otro userId cree
      // un canal nuevo y evita ventana en la que llegue un evento del user
      // anterior.
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

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
