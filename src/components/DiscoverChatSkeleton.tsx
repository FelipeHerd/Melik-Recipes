export function DiscoverChatSkeleton() {
  // Mimics 2 assistant + 1 user bubble with the same radii/max widths as the
  // real DiscoverIndex/ChatId views to avoid layout jumps on swap-in.
  return (
    <div
      className="flex flex-1 flex-col gap-4 p-4 md:p-6"
      aria-busy="true"
      aria-label="Cargando conversación"
    >
      {/* Assistant bubble */}
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 flex-none animate-pulse rounded-2xl bg-muted" />
        <div className="max-w-[85%] flex-1 rounded-3xl bg-card px-4 py-3">
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* User bubble */}
      <div className="flex items-start gap-3 flex-row-reverse">
        <span className="h-9 w-9 flex-none animate-pulse rounded-2xl bg-muted" />
        <div className="max-w-[75%] rounded-3xl bg-[color:var(--ochre)]/25 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Assistant bubble */}
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 flex-none animate-pulse rounded-2xl bg-muted" />
        <div className="max-w-[85%] flex-1 rounded-3xl bg-card px-4 py-3">
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
