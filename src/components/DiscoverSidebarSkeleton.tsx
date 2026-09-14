export function DiscoverSidebarSkeleton() {
  // Matches the width/spacing of the real chat <Link> rows so there's no CLS
  // when the actual list swaps in.
  const widths = ["w-4/5", "w-3/5", "w-5/6", "w-2/3", "w-3/4", "w-1/2"];
  return (
    <ul className="flex flex-col gap-1" aria-busy="true" aria-label="Cargando chats">
      {widths.map((w, i) => (
        <li key={i} className="flex items-center gap-1">
          <div className="flex-1 rounded-xl px-3 py-2">
            <div className={`h-4 ${w} animate-pulse rounded-md bg-muted`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
