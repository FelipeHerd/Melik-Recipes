import type { AdminStatsV2 } from "@/lib/admin-metrics.functions";
import { Flame } from "lucide-react";

export function TopKikoUsersTable({ rows }: { rows: AdminStatsV2["topKikoUsers"] | undefined }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-400">
          <Flame className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Top consumidores</p>
          <p className="text-sm text-zinc-300">Peticiones a Kiko este mes</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-zinc-800">
        {!rows?.length && (
          <li className="py-6 text-center text-sm text-zinc-500">
            Sin peticiones registradas todavía.
          </li>
        )}
        {rows?.map((r, i) => (
          <li key={r.userId} className="flex items-center gap-3 py-3">
            <span className="w-5 text-center text-xs text-zinc-500">{i + 1}</span>
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-zinc-800 text-xs text-zinc-300">
              {r.avatarUrl ? (
                <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (r.username ?? r.firstName ?? "?").slice(0, 1).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-200">@{r.username ?? "sin_username"}</p>
              {r.firstName && <p className="truncate text-xs text-zinc-500">{r.firstName}</p>}
            </div>
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-200">
              {r.requestCount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
