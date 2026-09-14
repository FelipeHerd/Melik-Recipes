import type { AdminStatsV2 } from "@/lib/admin-metrics.functions";
import { Users, Crown, Sparkles, BookOpen, Croissant, MessageCircle } from "lucide-react";

function Card({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tint: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      </div>
      <p className="mt-4 font-display text-3xl font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

export function KpiGrid({ stats }: { stats: AdminStatsV2 | undefined }) {
  const s = stats;
  const fmt = (n: number | undefined) => (n == null ? "—" : n.toLocaleString("es-ES"));
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Card
        label="Usuarios"
        value={fmt(s?.totalUsers)}
        icon={Users}
        tint="bg-blue-500/10 text-blue-400"
      />
      <Card
        label="Melik+ activos"
        value={fmt(s?.premiumActive)}
        icon={Crown}
        tint="bg-amber-500/10 text-amber-400"
      />
      <Card
        label="En prueba"
        value={fmt(s?.premiumTrials)}
        icon={Sparkles}
        tint="bg-fuchsia-500/10 text-fuchsia-400"
      />
      <Card
        label="Recetas totales"
        value={fmt(s?.totalRecipes)}
        icon={BookOpen}
        tint="bg-emerald-500/10 text-emerald-400"
      />
      <Card
        label="Oficiales Melik"
        value={fmt(s?.officialRecipes)}
        icon={Croissant}
        tint="bg-orange-500/10 text-orange-400"
      />
      <Card
        label="Kiko este mes"
        value={fmt(s?.kikoRequestsThisMonth)}
        icon={MessageCircle}
        tint="bg-primary/15 text-primary"
      />
    </div>
  );
}
