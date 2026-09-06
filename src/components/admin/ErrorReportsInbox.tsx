import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { listOpenErrorReports, resolveErrorReport } from "@/lib/admin-metrics.functions";
import { showError } from "@/lib/errors/toast";

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function ErrorReportsInbox() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin", "errors"],
    queryFn: () => listOpenErrorReports(),
    staleTime: 30_000,
  });
  const resolve = useMutation({
    mutationFn: (id: string) => resolveErrorReport({ data: { id } }),
    onSuccess: () => {
      toast.success("Reporte marcado como resuelto");
      qc.invalidateQueries({ queryKey: ["admin", "errors"] });
    },
    onError: (e) => showError(e),
  });

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/10 text-red-400">
          <Inbox className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Buzón</p>
          <p className="text-sm text-zinc-300">Reportes de error abiertos</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
        {isPending && (
          <p className="p-6 text-center text-sm text-zinc-500">Cargando…</p>
        )}
        {!isPending && !data?.length && (
          <p className="p-6 text-center text-sm text-zinc-500">Sin reportes abiertos ✨</p>
        )}
        {!!data?.length && (
          <ul className="divide-y divide-zinc-800">
            {data.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                      {r.code ?? "sin código"}
                    </span>
                    <span>{relative(r.createdAt)}</span>
                    {r.username && <span>@{r.username}</span>}
                    {r.route && <span className="truncate">{r.route}</span>}
                  </div>
                  <p className="mt-1.5 truncate text-sm text-zinc-200">{r.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => resolve.mutate(r.id)}
                  disabled={resolve.isPending}
                  className="inline-flex items-center gap-1.5 self-start rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
