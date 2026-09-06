// Skeleton shown while the CommunityFeed chunk is loading (Suspense) o
// mientras la primera página del feed hace fetch. Reproduce la grilla real
// para evitar saltos de layout al swap-in.
export function CommunityFeedSkeleton() {
  return (
    <div
      className="grid gap-4 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Cargando recetas de la comunidad"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <article
          key={i}
          className="flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-gradient-to-br from-primary/15 to-primary/5" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </article>
      ))}
    </div>
  );
}
