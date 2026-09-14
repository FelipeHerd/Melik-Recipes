// Community feed — Vacuna #2 in action: images are NEVER referenced.
// Each card renders an emoji placeholder with a gradient background.
import { useState, Suspense, lazy, useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import { Loader2, Clock, Users } from "lucide-react";
import {
  listCommunityRecipes,
  saveCommunityRecipe,
  type CommunityRecipe,
} from "@/lib/community.functions";
import { ModalFallback } from "@/components/ModalFallback";
import { CommunityFeedSkeleton } from "@/components/CommunityFeedSkeleton";

import { useInfiniteSentinel } from "@/hooks/use-infinite-sentinel";
import { useProfile } from "@/lib/use-profile";

const ViewRecipeModal = lazy(() =>
  import("@/components/ViewRecipeModal").then((m) => ({ default: m.ViewRecipeModal })),
);

export function CommunityFeed() {
  const queryClient = useQueryClient();
  const { userId } = useProfile();
  const [viewing, setViewing] = useState<CommunityRecipe | null>(null);
  const viewingIsOwn = !!viewing && !!userId && viewing.authorId === userId;

  const query = useInfiniteQuery({
    queryKey: ["community-feed"] as const,
    queryFn: ({ pageParam }) =>
      listCommunityRecipes({ data: { cursor: pageParam ?? null, limit: 12 } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const sentinelRef = useInfiniteSentinel(
    () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    { enabled: !!query.hasNextPage && !query.isFetchingNextPage },
  );

  const saveMut = useMutation({
    mutationFn: (recipeId: string) => saveCommunityRecipe({ data: { recipeId } }),
    onSuccess: async () => {
      toast.success("Guardada en tu recetario");
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setViewing(null);
    },
    onError: (e) => showError(e, "APP-RCP-004"),
  });

  if (query.isPending) {
    return <CommunityFeedSkeleton />;
  }

  if (query.isError) {
    return (
      <div className="grid min-h-[40vh] place-items-center p-6">
        <QueryErrorFallback error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
          <Users className="h-7 w-7" />
        </span>
        <h3 className="mt-4 font-display text-xl font-semibold">La comunidad aún está creciendo</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Aún no hay recetas públicas. ¡Publica la tuya y sé el primero!
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-3">
        {items.map((r) => (
          <CommunityCard key={r.id} recipe={r} onOpen={() => setViewing(r)} />
        ))}
      </div>
      {query.hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {query.isFetchingNextPage ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="h-1 w-24" aria-hidden />
          )}
        </div>
      )}

      {viewing && (
        <Suspense fallback={<ModalFallback />}>
          <ViewRecipeModal
            recipe={{
              id: viewing.id,
              title: viewing.title,
              category: viewing.category,
              emoji: viewing.emoji,
              timeMinutes: viewing.timeMinutes,
              ingredients: viewing.ingredients,
              instructions: viewing.instructions,
              isBakerMode: viewing.isBakerMode,
              originalAuthor: viewing.originalAuthor,
              imageUrl: null,
            }}
            readOnly
            hideImages
            ownershipNotice={viewingIsOwn ? "Eres el propietario de esta receta" : undefined}
            onClose={() => setViewing(null)}
            onSaveToLibrary={viewingIsOwn ? undefined : () => saveMut.mutate(viewing.id)}
            savingToLibrary={saveMut.isPending}
          />
        </Suspense>
      )}
    </>
  );
}

function CommunityCard({ recipe, onOpen }: { recipe: CommunityRecipe; onOpen: () => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver receta ${recipe.title}`}
        className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-gradient-to-br from-primary/15 to-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-6xl" aria-hidden>
          {recipe.emoji}
        </span>
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground/80 backdrop-blur">
          {recipe.category}
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <button type="button" onClick={onOpen} className="text-left focus:outline-none">
          <h3 className="font-display text-lg font-semibold leading-tight hover:text-primary">
            {recipe.title}
          </h3>
        </button>
        <p className="text-sm italic text-muted-foreground">
          Receta de <span className="font-medium not-italic">@{recipe.originalAuthor}</span>
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {recipe.timeMinutes} min
          </span>
        </div>
      </div>
    </article>
  );
}
