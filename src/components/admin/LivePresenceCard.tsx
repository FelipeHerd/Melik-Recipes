import { Radio } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getLivePresenceCount } from "@/lib/presence.functions";

export function LivePresenceCard() {
  const { data } = useQuery({
    queryKey: ["admin", "presence"],
    queryFn: () => getLivePresenceCount(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <Radio className="h-4 w-4 animate-pulse" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">En vivo</p>
          <p className="text-sm text-zinc-300">Usuarios conectados ahora</p>
        </div>
      </div>
      <p className="mt-6 font-display text-5xl font-semibold text-white tabular-nums">
        {data?.count ?? "—"}
      </p>
    </div>
  );
}
