import { Skeleton } from "@/components/ui/skeleton";
import { RecipesGridSkeleton } from "@/components/RecipesGridSkeleton";

export function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl md:w-48" />
        <Skeleton className="h-12 w-36 rounded-2xl" />
      </div>
      <RecipesGridSkeleton />
    </div>
  );
}
