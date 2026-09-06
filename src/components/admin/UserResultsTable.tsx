import type { AdminCrmRow } from "@/lib/admin-crm.functions";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function kikoStatus(iso: string | null) {
  if (!iso) return { label: "Activo", cls: "bg-emerald-500/10 text-emerald-300" };
  const until = new Date(iso);
  if (until <= new Date()) return { label: "Activo", cls: "bg-emerald-500/10 text-emerald-300" };
  return {
    label: `Bloqueado · ${fmtDate(iso)}`,
    cls: "bg-red-500/10 text-red-300",
  };
}

function subStatus(row: AdminCrmRow) {
  if (row.isPremium) return { label: "Melik+", cls: "bg-amber-500/10 text-amber-300" };
  if (row.premiumUntil && new Date(row.premiumUntil) > new Date()) {
    return {
      label: `Trial · ${fmtDate(row.premiumUntil)}`,
      cls: "bg-fuchsia-500/10 text-fuchsia-300",
    };
  }
  return { label: "Free", cls: "bg-zinc-800 text-zinc-400" };
}

export function UserResultsTable({
  rows,
  isPending,
  onSelect,
}: {
  rows: AdminCrmRow[] | undefined;
  isPending: boolean;
  onSelect: (row: AdminCrmRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      {isPending && <p className="p-6 text-center text-sm text-zinc-500">Buscando…</p>}
      {!isPending && !rows?.length && (
        <p className="p-6 text-center text-sm text-zinc-500">
          Ingresa un término de búsqueda para encontrar usuarios.
        </p>
      )}
      {!!rows?.length && (
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/40 text-left text-xs uppercase tracking-widest text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Kiko</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Suscripción</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell" title="Meses pagados totales">Meses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((r) => {
              const k = kikoStatus(r.kikoBlockedUntil);
              const s = subStatus(r);
              return (
                <tr
                  key={r.userId}
                  onClick={() => onSelect(r)}
                  className="cursor-pointer transition-colors hover:bg-zinc-900/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-800 text-xs">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-zinc-400">
                            {(r.username ?? r.email ?? "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-zinc-100">@{r.username ?? "sin_username"}</p>
                        <p className="truncate text-xs text-zinc-500">{r.email ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.role === "admin"
                          ? "bg-primary/15 text-primary"
                          : r.role === "dev"
                            ? "bg-blue-500/10 text-blue-300"
                            : "bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {r.role}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.cls}`}>
                      {k.label}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-zinc-400 sm:table-cell">
                    {r.paidMonthsTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
