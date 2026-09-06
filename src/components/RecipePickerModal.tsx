// Modal to pick a recipe from "My recipes" or "Melik Bakery" and attach it
// to the AI chat. Handles isLoading explicitly (cache miss on hard refresh).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChefHat, Lock, Search, Sparkles, X } from "lucide-react";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { useRecipes } from "@/lib/recipes-context";
import { useProfile } from "@/lib/use-profile";
import { listOfficialRecipes } from "@/lib/official-recipes.functions";
import type { AttachedRecipe } from "@/lib/recipe-context";

type Tab = "mine" | "official";

export function RecipePickerModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (r: AttachedRecipe) => void;
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const [query, setQuery] = useState("");

  useModalA11y(onClose);

  const { recipes, isLoading: recipesLoading, isAuthenticated } = useRecipes();
  const { isPremium } = useProfile();

  const officialQuery = useQuery({
    queryKey: ["official-recipes", "picker"],
    queryFn: () => listOfficialRecipes({ data: { limit: 50 } }),
    staleTime: 60_000,
  });

  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? recipes.filter((r) => r.title.toLowerCase().includes(q))
      : recipes;
  }, [recipes, query]);

  const filteredOfficial = useMemo(() => {
    const items = officialQuery.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return q ? items.filter((r) => r.title.toLowerCase().includes(q)) : items;
  }, [officialQuery.data, query]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl animate-enter sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-border/60 px-5 pb-3 pt-5 sm:px-6">
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl text-foreground/60 hover:bg-card hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <h2
            id="recipe-picker-title"
            className="inline-flex items-center gap-2 font-display text-xl font-semibold"
          >
            <BookOpen className="h-5 w-5 text-primary" /> Adjuntar receta
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kiko usará esta receta como contexto para tu próxima pregunta.
          </p>

          <div className="mt-3 flex gap-1 rounded-2xl bg-card p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={`flex-1 rounded-xl px-3 py-2 font-medium transition ${
                tab === "mine"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ChefHat className="mr-1.5 inline h-4 w-4" /> Mis Recetas
            </button>
            <button
              type="button"
              onClick={() => setTab("official")}
              className={`flex-1 rounded-xl px-3 py-2 font-medium transition ${
                tab === "official"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="mr-1.5 inline h-4 w-4" /> Melik Bakery
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título…"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {tab === "mine" ? (
            !isAuthenticated ? (
              <EmptyState
                icon={<Lock className="h-5 w-5" />}
                title="Inicia sesión"
                text="Regístrate gratis para adjuntar recetas guardadas."
              />
            ) : recipesLoading ? (
              <ListSkeleton />
            ) : filteredMine.length === 0 ? (
              <EmptyState
                icon={<ChefHat className="h-5 w-5" />}
                title={query ? "Sin coincidencias" : "Aún no tienes recetas"}
                text={
                  query
                    ? "Prueba con otro título."
                    : "Guarda tu primera receta para adjuntarla aquí."
                }
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filteredMine.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onSelect({ id: r.id, title: r.title, source: "mine" })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/60 hover:bg-card/70"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-background text-2xl">
                        {r.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.category} · {r.timeMinutes} min
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : officialQuery.isPending ? (
            <ListSkeleton />
          ) : officialQuery.error ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No se pudo cargar"
              text="Vuelve a intentarlo en unos segundos."
            />
          ) : filteredOfficial.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="Sin recetas"
              text={query ? "Sin coincidencias." : "Pronto habrá recetas oficiales."}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filteredOfficial.map((r) => {
                const locked = !isPremium;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        onSelect({ id: r.id, title: r.title, source: "official" })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/60 hover:bg-card/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-background text-2xl">
                        {r.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.category} · {r.timeMinutes} min
                        </p>
                      </div>
                      {locked && (
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Lock className="h-3 w-3" /> Premium
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
        >
          <span className="h-10 w-10 flex-none animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
