import { createFileRoute } from "@tanstack/react-router";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { LivePresenceCard } from "@/components/admin/LivePresenceCard";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { TopKikoUsersTable } from "@/components/admin/TopKikoUsersTable";
import { ErrorReportsInbox } from "@/components/admin/ErrorReportsInbox";
import { getAdminStatsV2, exportLeadsCsv, type LeadRow } from "@/lib/admin-metrics.functions";
import { showError } from "@/lib/errors/toast";

import { assertAdminOrRedirect } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async ({ context }) => {
    await assertAdminOrRedirect((context as { queryClient?: QueryClient })?.queryClient);
  },
  head: () => ({
    meta: [{ title: "Métricas — Panel Melik" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AdminMetrics,
});

function neutralize(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvField(v: string | number | boolean | null | undefined): string {
  let s = v == null ? "" : String(v);
  s = neutralize(s);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadLeads(rows: LeadRow[]) {
  const header = ["user_id", "email", "username", "created_at", "is_premium", "premium_until"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.userId),
        csvField(r.email),
        csvField(r.username),
        csvField(r.createdAt),
        csvField(r.isPremium),
        csvField(r.premiumUntil),
      ].join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `melik-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AdminMetrics() {
  const { data: stats, isPending } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getAdminStatsV2(),
    staleTime: 60_000,
  });

  const handleExport = async () => {
    try {
      const res = await exportLeadsCsv();
      if (!res.rows.length) {
        toast.info("Aún no hay leads para exportar");
        return;
      }
      downloadLeads(res.rows);
      toast.success(`${res.rows.length} leads exportados`);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-900 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Panel interno
            </p>
            <h1 className="font-display text-2xl font-semibold">Radar</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Exportar leads (.csv)
        </button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <LivePresenceCard />
        </div>
        <div className="md:col-span-2">
          <KpiGrid stats={stats} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TopKikoUsersTable rows={stats?.topKikoUsers} />
        <ErrorReportsInbox />
      </div>

      {isPending && <p className="mt-6 text-center text-xs text-zinc-500">Cargando métricas…</p>}
    </div>
  );
}
