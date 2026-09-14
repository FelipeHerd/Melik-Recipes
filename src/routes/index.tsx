import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Sparkles,
  Clock,
  ArrowUpDown,
  BookOpen,
  Filter,
  QrCode,
  FileText,
  ChevronRight,
} from "lucide-react";
import { ImageWithSkeleton } from "@/components/ImageWithSkeleton";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { useRecipes, type Recipe, type NewRecipe } from "@/lib/recipes-context";
import { useProfile } from "@/lib/use-profile";
import { useDrafts } from "@/lib/drafts";
import { useInfiniteSentinel } from "@/hooks/use-infinite-sentinel";
import { Link } from "@tanstack/react-router";
import { RecipesGridSkeleton } from "@/components/RecipesGridSkeleton";
import { isCustomCategory } from "@/lib/categories";
import { ingredientsToText } from "@/lib/recipe-format";
import { ModalFallback } from "@/components/ModalFallback";
// Pilar 5: modal pesado (~484 líneas + baker-calc). Se descarga bajo demanda.
const ViewRecipeModal = lazy(() =>
  import("@/components/ViewRecipeModal").then((m) => ({ default: m.ViewRecipeModal })),
);
const RecipeFormModal = lazy(() =>
  import("@/components/RecipeFormModal").then((m) => ({ default: m.RecipeFormModal })),
);
import { ChefFab } from "@/components/ChefFab";
const QrScannerModal = lazy(() =>
  import("@/components/QrScannerModal").then((m) => ({ default: m.QrScannerModal })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mis Recetas — Melik Recipes" },
      {
        name: "description",
        content:
          "Organiza, busca y cocina tus recetas favoritas con ayuda de un asistente IA en Melik Recipes.",
      },
      { property: "og:title", content: "Mis Recetas — Melik Recipes" },
      {
        property: "og:description",
        content: "Organiza, busca y cocina tus recetas favoritas con ayuda de un asistente IA.",
      },
      { property: "og:url", content: "https://melik-recipes.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/" }],
  }),
  component: Home,
});

type SortKey = "recent" | "az" | "time";

function Home() {
  const {
    recipes,
    addRecipe,
    updateRecipe,
    deleteRecipe,
    isAuthenticated,
    isLoading,
    hasMore,
    isFetchingMore,
    loadMore,
  } = useRecipes();
  const { count: draftCount } = useDrafts(isAuthenticated);
  const { profile } = useProfile();
  const currentUsername = profile?.username ?? null;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchCompact, setSearchCompact] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const sentinelRef = useInfiniteSentinel(loadMore, { enabled: hasMore && !isFetchingMore });

  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) return;
    const container = input.parentElement;
    if (!container) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const computed = window.getComputedStyle(input);
    ctx.font = `${computed.fontSize} ${computed.fontFamily}`;
    const text = input.placeholder;
    const textWidth = ctx.measureText(text).width;
    const threshold = textWidth + 72; // icon + paddings + small safety margin

    const update = (width: number) => setSearchCompact(width < threshold);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        update(entry.contentRect.width);
      }
    });
    update(container.getBoundingClientRect().width);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const viewing = useMemo(
    () => recipes.find((r) => r.id === viewingId) ?? null,
    [recipes, viewingId],
  );
  const editing = useMemo(
    () => recipes.find((r) => r.id === editingId) ?? null,
    [recipes, editingId],
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
    let list = recipes.filter((r) => {
      if (!q) return true;
      const ingText = ingredientsToText(r.ingredients).toLowerCase();
      return r.title.toLowerCase().includes(q) || ingText.includes(q);
    });
    if (categoryFilter !== "__all") {
      list = list.filter((r) => r.category === categoryFilter);
    }
    if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "time") list = [...list].sort((a, b) => a.timeMinutes - b.timeMinutes);
    else list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [recipes, query, sort, categoryFilter]);

  const handleDelete = async (r: Recipe) => {
    const ok = window.confirm(`¿Eliminar "${r.title}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await deleteRecipe(r.id);
    } catch {
      /* context ya mostró el toast de error */
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wider text-[color:var(--ochre)]">
          Tu recetario
        </p>
        <h1 className="font-display text-4xl font-semibold md:text-5xl">Mis Recetas</h1>
        <p className="max-w-xl text-muted-foreground">
          Guarda recetas de cualquier fuente y deja que el asistente te guíe paso a paso cuando
          cocines.
        </p>
      </div>

      {!isAuthenticated && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-5 py-3 text-sm">
          <span className="text-foreground/80">
            Estás navegando como invitado. <strong>Inicia sesión</strong> para guardar tus recetas
            en la nube y verlas desde cualquier dispositivo.
          </span>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Iniciar sesión
          </Link>
        </div>
      )}

      {/* Controls */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative col-span-2 md:col-span-1">
          {(() => {
            const compact = searchCompact && !searchFocused && !query;
            return (
              <>
                {compact ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground transition-all duration-200">
                    <Search className="h-4 w-4" />
                  </span>
                ) : (
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-all duration-200" />
                )}
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={compact ? "" : "Buscar por título o ingrediente…"}
                  aria-label="Buscar recetas"
                  className={`h-12 w-full rounded-2xl border border-border bg-card pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-200 ${
                    compact ? "pl-4 text-center" : "pl-11 text-left"
                  }`}
                />
              </>
            );
          })()}
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            disabled={categories.length === 0}
            className={`h-12 w-full appearance-none rounded-2xl border border-border bg-card pl-11 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-[width] duration-200 disabled:opacity-50 ${query ? "md:w-auto" : "md:w-52"}`}
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
            className={`h-12 w-full appearance-none rounded-2xl border border-border bg-card pl-11 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-[width] duration-200 ${query ? "md:w-auto" : "md:w-48"}`}
          >
            <option value="recent">Recientes</option>
            <option value="az">A–Z</option>
            <option value="time">Tiempo</option>
          </select>
        </div>

        <div className="col-span-2 flex items-center gap-2 md:col-span-1">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0"
          >
            <Plus className="h-4 w-4" /> Añadir Receta
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              aria-label="Escanear código QR"
              title="Escanear código QR"
              className="grid h-12 w-12 flex-none place-items-center rounded-full border border-border bg-card text-foreground/80 shadow-sm transition hover:-translate-y-0.5 hover:bg-background"
            >
              <QrCode className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Borradores strip */}
      {isAuthenticated && draftCount > 0 && (
        <Link
          to="/drafts"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-[color:var(--ochre)]/10 px-4 py-3 text-sm transition hover:bg-[color:var(--ochre)]/20"
        >
          <span className="inline-flex items-center gap-2 text-foreground">
            <FileText className="h-4 w-4 text-[color:var(--ochre)]" />
            <span className="font-medium">Borradores</span>
            <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-foreground/70">
              {draftCount}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {/* Grid */}
      {isLoading ? (
        <RecipesGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          {recipes.length === 0 ? (
            !isAuthenticated ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => setOpen(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0"
                >
                  <Plus className="h-4 w-4" />
                  Añadir mi primer receta
                </button>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Crea recetas ahora y decide si importarlas a tu cuenta luego.
                </p>
              </div>
            ) : (
              <p className="font-display text-xl">Aún no hay recetas guardadas.</p>
            )
          ) : (
            <>
              <p className="font-display text-xl">Aún no hay recetas que coincidan.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prueba con otro término o añade una nueva.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onOpen={() => setViewingId(r.id)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="mt-8 flex justify-center py-6">
              {isFetchingMore ? (
                <span className="text-xs text-muted-foreground">Cargando más recetas…</span>
              ) : (
                <span className="h-1 w-24" aria-hidden />
              )}
            </div>
          )}
        </>
      )}

      {open && (
        <Suspense fallback={<ModalFallback />}>
          <RecipeFormModal
            isAuthenticated={isAuthenticated}
            onClose={() => setOpen(false)}
            onSave={async (r, meta) => {
              try {
                // If the modal autosaved a draft, publish that row (update it)
                // instead of creating a duplicate.
                if (meta.draftId) {
                  await updateRecipe(meta.draftId, { ...r, isDraft: false });
                } else {
                  await addRecipe(r);
                }
                setOpen(false);
              } catch (err) {
                showError(err, "APP-RCP-004");
              }
            }}
          />
        </Suspense>
      )}

      {editing && (
        <Suspense fallback={<ModalFallback />}>
          <RecipeFormModal
            key={editing.id}
            initial={editing}
            isAuthenticated={isAuthenticated}
            onClose={() => setEditingId(null)}
            onSave={async (r) => {
              try {
                // Editing an existing recipe (draft or not) → always publish.
                await updateRecipe(editing.id, { ...r, isDraft: false });
                setEditingId(null);
              } catch {
                /* context ya mostró el toast de error */
              }
            }}
          />
        </Suspense>
      )}

      {viewing && (
        <Suspense fallback={<ModalFallback />}>
          <ViewRecipeModal
            recipe={{ ...viewing, isBakerMode: viewing.isBakerMode }}
            currentUsername={currentUsername}
            onClose={() => setViewingId(null)}
            onEdit={() => {
              setEditingId(viewing.id);
              setViewingId(null);
            }}
          />
        </Suspense>
      )}

      <ChefFab />

      {qrOpen && (
        <Suspense fallback={null}>
          <QrScannerModal onClose={() => setQrOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  onOpen,
  onDelete,
}: {
  recipe: Recipe;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const custom = !recipe.imageUrl && isCustomCategory(recipe.category);
  const preview = useMemo(() => ingredientsToText(recipe.ingredients), [recipe.ingredients]);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver receta ${recipe.title}`}
        className={
          "relative grid h-40 w-full place-items-center overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          (custom
            ? "bg-gradient-to-br from-[color:var(--secondary)] to-[color:var(--ochre)]/40"
            : "bg-gradient-to-br from-[color:var(--ochre)]/30 to-primary/20")
        }
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
        ) : custom ? null : (
          <span className="text-6xl" aria-hidden>
            {recipe.emoji}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground/80 backdrop-blur">
          {recipe.category}
        </span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Borrar ${recipe.title}`}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-background/80 text-foreground/70 backdrop-blur transition hover:bg-background hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <button type="button" onClick={onOpen} className="text-left focus:outline-none">
          <h2 className="font-display text-xl font-semibold leading-tight hover:text-primary">
            {recipe.title}
          </h2>
        </button>
        <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{preview}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {recipe.timeMinutes} min
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-card"
            >
              <BookOpen className="h-3.5 w-3.5" /> Ver
            </button>
            <Link
              to="/chef"
              search={{ recipeId: recipe.id } as never}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-[#deccb8] px-3.5 py-2 text-xs font-medium text-foreground hover:bg-[#d4c0ac]"
            >
              <Sparkles className="h-3.5 w-3.5" /> Cocinar con Kiko
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// ViewRecipeModal lives in @/components/ViewRecipeModal (shared with the
// Melik Bakery + Descubrir routes and adds baker calculator support).
