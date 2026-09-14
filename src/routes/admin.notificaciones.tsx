import { createFileRoute } from "@tanstack/react-router";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Bell, History } from "lucide-react";
import { NotificationComposer } from "@/components/admin/NotificationComposer";
import { listNotificationHistory } from "@/lib/admin-notifications.functions";

import { assertAdminOrRedirect } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/notificaciones")({
  beforeLoad: async ({ context }) => {
    await assertAdminOrRedirect((context as { queryClient?: QueryClient })?.queryClient);
  },
  head: () => ({
    meta: [
      { title: "Notificaciones — Panel Melik" },
      {
        name: "description",
        content: "Envío manual de notificaciones a usuarios de Melik.",
      },
      { property: "og:title", content: "Notificaciones — Panel Melik" },
      {
        property: "og:description",
        content: "Envío manual de notificaciones a usuarios de Melik.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminNotifications,
});

function AdminNotifications() {
  const history = useQuery({
    queryKey: ["admin", "notif-history"],
    queryFn: () => listNotificationHistory({ data: { limit: 30 } }),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-900 text-primary">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Comunicación
          </p>
          <h1 className="font-display text-2xl font-semibold text-zinc-100">
            Enviar notificaciones
          </h1>
        </div>
      </div>

      <NotificationComposer />

      <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-zinc-100">Historial reciente</h2>
        </div>

        {history.isLoading ? (
          <p className="text-xs text-zinc-500">Cargando…</p>
        ) : !history.data || history.data.length === 0 ? (
          <p className="text-xs text-zinc-500">Aún no has enviado notificaciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Admin</th>
                  <th className="px-2 py-2">Plantilla</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Destino</th>
                  <th className="px-2 py-2 text-right">OK</th>
                  <th className="px-2 py-2 text-right">Fallos</th>
                  <th className="px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {history.data.map((r) => {
                  const date = new Date(r.createdAt);
                  const status =
                    r.status === "ok"
                      ? "text-emerald-400"
                      : r.status === "partial"
                        ? "text-amber-400"
                        : r.status === "pending"
                          ? "text-zinc-400"
                          : "text-red-400";
                  return (
                    <tr key={r.auditId} className="text-zinc-300">
                      <td className="whitespace-nowrap px-2 py-2 text-zinc-500">
                        {date.toLocaleString("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-2 py-2">
                        {r.adminFirstName ?? r.adminUsername ?? r.adminId.slice(0, 8)}
                      </td>
                      <td className="px-2 py-2 text-zinc-400">
                        {r.custom ? "Personalizada" : (r.templateId ?? "—")}
                      </td>
                      <td className="px-2 py-2 text-zinc-400">{r.type ?? "—"}</td>
                      <td className="px-2 py-2 text-right">{r.targetsCount}</td>
                      <td className="px-2 py-2 text-right text-emerald-400">{r.inserted}</td>
                      <td className="px-2 py-2 text-right text-red-400">{r.failedCount || ""}</td>
                      <td className={`px-2 py-2 ${status}`}>{r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
