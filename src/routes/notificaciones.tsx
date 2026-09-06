import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteNotification,
  listMyNotifications,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/admin.functions";
import { showError } from "@/lib/errors/toast";

export const Route = createFileRoute("/notificaciones")({
  head: () => ({
    meta: [
      { title: "Notificaciones — Melik Recipes" },
      {
        name: "description",
        content: "Revisa tus notificaciones y novedades en Melik Recipes.",
      },
      { property: "og:title", content: "Notificaciones — Melik Recipes" },
      {
        property: "og:description",
        content: "Revisa tus notificaciones y novedades en Melik Recipes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const typeLabel: Record<NotificationRow["type"], string> = {
  admin: "Admin",
  kiko: "Kiko",
  melik_plus: "Melik+",
  system: "Sistema",
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function NotificationsPage() {
  const queryClient = useQueryClient();

  // userId scoped: evita mostrar datos del usuario anterior en la misma pestaña
  // si Auth cambia sin recarga. Query desactivada hasta que resuelva.
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

  const listKey = ["notifications", "mine", userId] as const;
  const countKey = ["notifications", "unreadCount", userId] as const;

  const notificationsQuery = useQuery({
    queryKey: listKey,
    queryFn: () => listMyNotifications(),
    enabled: !!userId,
    staleTime: 10_000,
    refetchOnMount: "always",
  });

  const invalidateBoth = () => {
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: countKey });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ data: { id } }),
    onSuccess: invalidateBoth,
    onError: (error) => showError(error),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification({ data: { id } }),
    onSuccess: invalidateBoth,
    onError: (error) => showError(error),
  });

  const notifications = notificationsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          Notificaciones
        </h1>
      </header>


      {!userId || notificationsQuery.isLoading ? (
        <LoadingState />
      ) : notificationsQuery.isError ? (
        <ErrorState />
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkRead={() => markRead.mutate(n.id)}
              onDelete={() => remove.mutate(n.id)}
              busy={markRead.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  busy,
}: {
  notification: NotificationRow;
  onMarkRead: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <li className="rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm transition-colors hover:bg-card/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!notification.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary" aria-label="No leída" />
            )}
            <Badge variant="secondary" className="shrink-0">
              {typeLabel[notification.type] ?? notification.type}
            </Badge>
            <time className="text-xs text-muted-foreground" dateTime={notification.created_at}>
              {dateFmt.format(new Date(notification.created_at))}
            </time>
          </div>
          <p className="mt-3 break-words font-medium leading-snug">{notification.title}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {notification.message}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!notification.is_read && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Marcar como leída"
              disabled={busy}
              onClick={onMarkRead}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Eliminar notificación"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-border/60 bg-card/30" />
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
      <Bell className="h-8 w-8 text-muted-foreground" />
      <h2 className="font-display text-xl font-semibold">No pudimos cargar tus notificaciones</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Revisa que hayas iniciado sesión y vuelve a intentarlo.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
      <h2 className="font-display text-xl font-semibold">
        Aún no tienes notificaciones
      </h2>

      <p className="max-w-sm text-sm text-muted-foreground">
        Cuando tengas mensajes nuevos, aparecerán aquí.
      </p>
    </div>
  );
}
