import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useInfiniteSentinel } from "@/hooks/use-infinite-sentinel";
import {
  Clock,
  Crown,
  Lock,
  Search,
  Filter,
  ArrowUpDown,
  BookOpen,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import { ImageWithSkeleton } from "@/components/ImageWithSkeleton";
import { RecipesGridSkeleton } from "@/components/RecipesGridSkeleton";
import { ModalFallback } from "@/components/ModalFallback";
import { ChefFab } from "@/components/ChefFab";
import { useProfile } from "@/lib/use-profile";
import {
  getOfficialRecipe,
  listOfficialRecipes,
  type OfficialRecipeCardDto,
} from "@/lib/official-recipes.functions";
import {
  claimBakeryUnlock,
  getMyBakeryEntitlements,
} from "@/lib/melik-plus.functions";
import { showError } from "@/lib/errors/toast";
import type { ViewableRecipe } from "@/components/ViewRecipeModal";

// Pilar 5: modal pesado descargado bajo demanda tras el clic.
const ViewRecipeModal = lazy(() =>
  import("@/components/ViewRecipeModal").then((m) => ({ default: m.ViewRecipeModal })),
);

const entitlementsQuery = queryOptions({
  queryKey: ["bakery-entitlements"] as const,
  queryFn: () => getMyBakeryEntitlements(),
  staleTime: 60 * 1000,
});



const OFFICIAL_PAGE_SIZE = 12;

// Pilar 4: infinite query keyset. La primera página también alimenta el
// head() para SEO (JSON-LD `@graph`), lo que evita un fetch extra en SSR.
const officialRecipesInfinite = infiniteQueryOptions({
  queryKey: ["official-recipes-infinite"] as const,
  queryFn: ({ pageParam }) =>
    listOfficialRecipes({ data: { cursor: pageParam ?? null, limit: OFFICIAL_PAGE_SIZE } }),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.nextCursor,
  staleTime: 5 * 60 * 1000,
});

function toIsoDuration(minutes: number): string | null {
  if (!minutes || minutes <= 0) return null;
  return `PT${Math.round(minutes)}M`;
}

export const Route = createFileRoute("/melik-bakery")({
  loader: async ({ context }) => {
    // Pilar 4: prime la cache infinita con la primera página; el SEO usa
    // ese mismo dato (sin fetch duplicado desde el cliente).
    const first = await listOfficialRecipes({ data: { limit: OFFICIAL_PAGE_SIZE } });
    context.queryClient.setQueryData(officialRecipesInfinite.queryKey, {
      pages: [first],
      pageParams: [null as string | null],
    });
    return first;
  },
  head: ({ loaderData }) => {
    const recipes = loaderData?.items ?? [];
    // Sanitized catalog: only name / image / prepTime / recipeCategory.
    // NEVER expose ingredients or recipeInstructions here.
    const graph = recipes.map((r) => {
      const node: Record<string, unknown> = {
        "@type": "Recipe",
        name: r.title,
      };
      if (r.imageUrl) node.image = r.imageUrl;
      const prep = toIsoDuration(r.timeMinutes);
      if (prep) node.prepTime = prep;
      if (r.category) node.recipeCategory = r.category;
      return node;
    });

    return {
      meta: [
        { title: "Melik Bakery — Recetas oficiales" },
        {
          name: "description",
          content:
            "Explora el catálogo oficial de recetas de la Melik Bakery: panadería artesanal, dulces y clásicos de la casa.",
        },
        { property: "og:title", content: "Melik Bakery — Recetas oficiales" },
        {
          property: "og:description",
          content:
            "Explora el catálogo oficial de recetas de la Melik Bakery: panadería artesanal, dulces y clásicos de la casa.",
        },
        { property: "og:url", content: "https://melik-recipes.lovable.app/melik-bakery" },
      ],
      links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/melik-bakery" }],
      scripts:
        graph.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@graph": graph,
                }),
              },
            ]
          : [],
    };
  },
  component: MelikBakeryPage,
});


type SortKey = "recent" | "az" | "time";

function MelikBakeryPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wider text-[color:var(--ochre)]">
          Catálogo oficial
        </p>
        <h1 className="font-display text-4xl font-semibold md:text-5xl">Melik Bakery</h1>
        <p className="max-w-xl text-muted-foreground">
          Las recetas oficiales de Melik Bakery. Con Melik+ ganas un desbloqueo
          permanente cada 6 meses acumulados de suscripción. Además, te regalamos
          5% de descuento en todas las compras que hagas en Melik Bakery a través
          de su{" "}
          <a
            href="https://melikbakery.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            web
          </a>
          .
        </p>
      </div>

      <EntitlementsBanner />

      <Suspense fallback={<BakerySkeleton />}>
        <BakeryList />
      </Suspense>

      <ChefFab />
    </div>
  );
}

/**
 * Barra de estado con desbloqueos disponibles / próximo hito.
 * Sólo visible para usuarios autenticados — invitados verían un CTA a
 * Melik+ que ya cubre la landing.
 */
function EntitlementsBanner() {
  const { isAuthenticated } = useProfile();
  const { data } = useQuery({ ...entitlementsQuery, enabled: isAuthenticated });
  if (!isAuthenticated || !data) return null;

  const { unlocksAvailable, paidMonthsTotal, monthsToNextUnlock, cycleMonth } = data;
  const monthsToNext = monthsToNextUnlock;

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-[color:var(--ochre)]/30 bg-gradient-to-br from-[color:var(--ochre)]/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--ochre)]/20 text-[color:var(--ochre)]">
          <Crown className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {unlocksAvailable > 0 ? (
              <>
                Tienes{" "}
                <span className="text-[color:var(--ochre)]">
                  {unlocksAvailable}{" "}
                  {unlocksAvailable === 1 ? "desbloqueo disponible" : "desbloqueos disponibles"}
                </span>
              </>
            ) : (
              "Aún no tienes desbloqueos disponibles"
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {paidMonthsTotal === 0
              ? "Suscríbete a Melik+ para empezar a acumular meses."
              : monthsToNext === 0
              ? "¡Canjea la receta oficial que quieras!"
              : `Faltan ${monthsToNext} ${monthsToNext === 1 ? "mes" : "meses"} para tu próximo desbloqueo (mes ${cycleMonth + monthsToNext} del ciclo).`}
          </p>
        </div>
      </div>
    </div>
  );
}


function BakerySkeleton() {
  return (
    <>
      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="h-12 rounded-2xl border border-border bg-card/50" />
        <div className="h-12 rounded-2xl border border-border bg-card/50 md:w-52" />
        <div className="h-12 rounded-2xl border border-border bg-card/50 md:w-48" />
      </div>
      <RecipesGridSkeleton count={6} />
    </>
  );
}

function BakeryList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(officialRecipesInfinite);
  const recipes = useMemo(() => data.pages.flatMap((p) => p.items), [data.pages]);

  const { isAuthenticated } = useProfile();
  const { data: entitlements } = useQuery({
    ...entitlementsQuery,
    enabled: isAuthenticated,
  });
  const unlockedIds = useMemo(
    () => new Set(entitlements?.unlockedRecipeIds ?? []),
    [entitlements?.unlockedRecipeIds],
  );


  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [openId, setOpenId] = useState<string | null>(null);
  const openingCard = useMemo(
    () => recipes.find((r) => r.id === openId) ?? null,
    [openId, recipes],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) if (r.category) set.add(r.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  useEffect(() => {
    if (categoryFilter !== "__all" && !categories.includes(categoryFilter)) {
      setCategoryFilter("__all");
    }
  }, [categories, categoryFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = recipes.filter((r) => (!q ? true : r.title.toLowerCase().includes(q)));
    if (categoryFilter !== "__all") {
      list = list.filter((r) => r.category === categoryFilter);
    }
    if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "time") list = [...list].sort((a, b) => a.timeMinutes - b.timeMinutes);
    return list;
  }, [recipes, query, sort, categoryFilter]);

  const sentinelRef = useInfiniteSentinel(
    () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    { enabled: hasNextPage && !isFetchingNextPage },
  );

  // Always open the modal — the server decides whether to redact the payload
  // and the modal renders the paywall overlay when `isLocked === true`.
  const onOpen = (r: OfficialRecipeCardDto) => setOpenId(r.id);

  return (
    <>
      {/* Controls */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative col-span-2 md:col-span-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el catálogo oficial…"
            aria-label="Buscar recetas oficiales"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            disabled={categories.length === 0}
            className="h-12 w-full appearance-none rounded-2xl border border-border bg-card pl-11 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 md:w-52"
          >
            <option value="__all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar por"
            className="h-12 w-full appearance-none rounded-2xl border border-border bg-card pl-11 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring md:w-48"
          >
            <option value="recent">Recientes</option>
            <option value="az">A–Z</option>
            <option value="time">Tiempo</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          {recipes.length === 0 ? (
            <>
              <p className="font-display text-xl">Pronto habrá recetas oficiales aquí.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                El equipo de Melik está horneando el primer lote del catálogo.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl">No hay recetas que coincidan.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prueba con otro término o cambia el filtro.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <OfficialCard
                key={r.id}
                recipe={r}
                locked={r.isPremiumOnly && !unlockedIds.has(r.id)}
                unlocked={unlockedIds.has(r.id)}
                onOpen={() => onOpen(r)}
              />

            ))}
          </div>
          {hasNextPage && (
            <div ref={sentinelRef} className="mt-8 flex justify-center py-6">
              {isFetchingNextPage ? (
                <span className="text-xs text-muted-foreground">Cargando más recetas…</span>
              ) : (
                <span className="h-1 w-24" aria-hidden />
              )}
            </div>
          )}
        </>
      )}

      {openId && openingCard && (
        <Suspense fallback={<ModalFallback />}>
          <OfficialRecipeLoader
            id={openId}
            fallback={openingCard}
            onClose={() => setOpenId(null)}
          />
        </Suspense>
      )}
    </>
  );
}

function OfficialCard({
  recipe,
  locked,
  unlocked = false,
  onOpen,
}: {
  recipe: OfficialRecipeCardDto;
  locked: boolean;
  unlocked?: boolean;
  onOpen: () => void;
}) {

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir receta oficial ${recipe.title}`}
        className="relative grid h-40 w-full place-items-center overflow-hidden bg-gradient-to-br from-[color:var(--ochre)]/30 to-primary/20 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {recipe.imageUrl ? (
          <ImageWithSkeleton
            src={recipe.imageUrl}
            alt={recipe.title}
            width={640}
            height={320}
            loading="lazy"
            decoding="async"
            wrapperClassName="absolute inset-0"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-6xl" aria-hidden>
            {recipe.emoji}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground/80 backdrop-blur">
          {recipe.category || "Melik"}
        </span>
        {unlocked ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md">
            <CheckCircle2 className="h-3 w-3" /> Desbloqueada
          </span>
        ) : locked ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-md">
            <Crown className="h-3 w-3" /> Melik+
          </span>
        ) : null}

      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <button type="button" onClick={onOpen} className="text-left focus:outline-none">
          <h2 className="font-display text-xl font-semibold leading-tight hover:text-primary">
            {recipe.title}
          </h2>
        </button>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {locked
            ? "Suscríbete a Melik+ para ver ingredientes y pasos."
            : "Toca para ver la receta completa."}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {recipe.timeMinutes} min
          </span>
          <button
            type="button"
            onClick={onOpen}
            className={
              locked
                ? "inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                : "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-card"
            }
          >
            {locked ? (
              <>
                <Lock className="h-3.5 w-3.5" /> Desbloquear
              </>
            ) : (
              <>
                <BookOpen className="h-3.5 w-3.5" /> Ver receta
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Wraps the shared ViewRecipeModal, fetching the full recipe on demand.
 */
function OfficialRecipeLoader({
  id,
  fallback,
  onClose,
}: {
  id: string;
  fallback: OfficialRecipeCardDto;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { isAuthenticated, isPremium } = useProfile();
  const { data } = useSuspenseQuery({
    queryKey: ["official-recipe", id],
    queryFn: () => getOfficialRecipe({ data: { id } }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: entitlements } = useQuery({
    ...entitlementsQuery,
    enabled: isAuthenticated,
  });

  const claim = useMutation({
    mutationFn: () => claimBakeryUnlock({ data: { recipeId: id } }),
    onSuccess: async () => {
      // Invalidamos las cachés que rigen la UI de desbloqueos + la propia
      // receta (que dejará de venir redactada del servidor).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bakery-entitlements"] }),
        queryClient.invalidateQueries({ queryKey: ["official-recipe", id] }),
      ]);
      toast.success("¡Receta desbloqueada!", {
        description: "Ya está en tu recetario oficial para siempre.",
      });
    },
    onError: (err) => showError(err),
  });

  const view: ViewableRecipe = {
    id: data.id,
    title: data.title,
    category: data.category,
    emoji: data.emoji,
    timeMinutes: data.timeMinutes,
    imageUrl: data.imageUrl,
    ingredients: data.ingredients,
    instructions: data.instructions,
    isBakerMode: data.isBakerMode,
  };

  void fallback;
  void Sparkles;

  return (
    <ViewRecipeModal
      recipe={view}
      onClose={onClose}
      readOnly
      officialBadge
      isLocked={data.isLocked}
      paywall={{
        isPremium,
        unlocksAvailable: entitlements?.unlocksAvailable ?? 0,
        nextUnlockAtMonth: entitlements?.nextUnlockAtMonth ?? 1,
        paidMonthsTotal: entitlements?.paidMonthsTotal ?? 0,
        onClaim: () => claim.mutate(),
        claiming: claim.isPending,
      }}
    />
  );
}

