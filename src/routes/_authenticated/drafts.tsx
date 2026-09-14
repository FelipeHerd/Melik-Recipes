import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ImageWithSkeleton } from "@/components/ImageWithSkeleton";
import { RecipesGridSkeleton } from "@/components/RecipesGridSkeleton";
import { ModalFallback } from "@/components/ModalFallback";
import { useDrafts } from "@/lib/drafts";
import { useRecipes, type Recipe } from "@/lib/recipes-context";
import { isCustomCategory } from "@/lib/categories";
import { ingredientsToText } from "@/lib/recipe-format";

const RecipeFormModal = lazy(() =>
  import("@/components/RecipeFormModal").then((m) => ({ default: m.RecipeFormModal })),
);

export const Route = createFileRoute("/_authenticated/drafts")({
  head: () => ({
    meta: [
      { title: "Borradores — Melik Recipes" },
      { name: "description", content: "Retoma y publica tus borradores de recetas." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DraftsPage,
});

function DraftsPage() {
  const { drafts, isLoading, deleteDraft } = useDrafts(true);
  const { updateRecipe, isAuthenticated } = useRecipes();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => drafts.find((d) => d.id === editingId) ?? null,
    [drafts, editingId],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver a Mis Recetas"
          className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground/80 transition hover:bg-background"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--ochre)]">
            No finalizadas
          </p>
          <h1 className="font-display text-3xl font-semibold md:text-4xl">Borradores</h1>
        </div>
      </header>

      {isLoading ? (
        <RecipesGridSkeleton />
      ) : drafts.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="font-display text-xl">No tienes borradores guardados.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando empieces a crear una receta se guardará automáticamente aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              onOpen={() => setEditingId(d.id)}
              onDelete={async () => {
                const ok = window.confirm(`¿Eliminar borrador "${d.title || "Sin título"}"?`);
                if (!ok) return;
                await deleteDraft(d.id);
              }}
            />
          ))}
        </div>
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
                await updateRecipe(editing.id, { ...r, isDraft: false });
                toast.success("Borrador publicado");
                setEditingId(null);
              } catch {
                /* toast already shown */
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  onOpen,
  onDelete,
}: {
  draft: Recipe;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const custom = !draft.imageUrl && isCustomCategory(draft.category);
  const preview = useMemo(() => ingredientsToText(draft.ingredients), [draft.ingredients]);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Continuar borrador ${draft.title || "sin título"}`}
        className={
          "relative grid h-40 w-full place-items-center overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          (custom
            ? "bg-gradient-to-br from-[color:var(--secondary)] to-[color:var(--ochre)]/40"
            : "bg-gradient-to-br from-[color:var(--ochre)]/30 to-primary/20")
        }
      >
        {draft.imageUrl ? (
          <ImageWithSkeleton
            src={draft.imageUrl}
            alt={draft.title}
            width={640}
            height={320}
            loading="lazy"
            decoding="async"
            wrapperClassName="absolute inset-0"
            className="h-full w-full object-cover"
          />
        ) : custom ? null : (
          <span className="text-6xl" aria-hidden>
            {draft.emoji}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-[color:var(--ochre)]/90 px-2.5 py-1 text-xs font-medium text-background backdrop-blur">
          Borrador
        </span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Borrar borrador ${draft.title || "sin título"}`}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-background/80 text-foreground/70 backdrop-blur transition hover:bg-background hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <button type="button" onClick={onOpen} className="text-left focus:outline-none">
          <h2 className="font-display text-xl font-semibold leading-tight hover:text-primary">
            {draft.title || <span className="italic text-muted-foreground">Sin título</span>}
          </h2>
        </button>
        {preview && (
          <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
            {preview}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {draft.timeMinutes} min
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-[#deccb8] px-3.5 py-2 text-xs font-medium text-foreground hover:bg-[#d4c0ac]"
          >
            <BookOpen className="h-3.5 w-3.5" /> Continuar
          </button>
        </div>
      </div>
    </article>
  );
}
