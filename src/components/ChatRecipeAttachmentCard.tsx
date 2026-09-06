// Compact card rendered inside a chat message when the user attached a recipe.
// Shows the recipe like a "Mis recetas" card and opens the read-only
// ViewRecipeModal (no edit, no "Cocinar con Kiko" actions).
import { useState } from "react";
import { BookOpen, Eye, Loader2, Sparkles } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { toast } from "sonner";
import { useRecipes } from "@/lib/recipes-context";
import { getOfficialRecipe } from "@/lib/official-recipes.functions";
import { ViewRecipeModal, type ViewableRecipe } from "@/components/ViewRecipeModal";
import type { AttachedRecipe } from "@/lib/recipe-context";

export function ChatRecipeAttachmentCard({ attached }: { attached: AttachedRecipe }) {
  const { recipes } = useRecipes();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewable, setViewable] = useState<ViewableRecipe | null>(null);

  async function handleOpen() {
    if (loading) return;
    if (attached.source === "mine") {
      const r = recipes.find((x) => x.id === attached.id);
      if (!r) {
        toast.error("Esta receta ya no está en tu recetario");
        return;
      }
      setViewable({
        id: r.id,
        title: r.title,
        category: r.category,
        emoji: r.emoji,
        timeMinutes: r.timeMinutes,
        imageUrl: r.imageUrl,
        ingredients: r.ingredients,
        instructions: r.instructions,
        isBakerMode: r.isBakerMode,
      });
      setOpen(true);
      return;
    }
    // Official — fetch on demand
    setLoading(true);
    try {
      const r = await getOfficialRecipe({ data: { id: attached.id } });
      setViewable({
        id: r.id,
        title: r.title,
        category: r.category,
        emoji: r.emoji,
        timeMinutes: r.timeMinutes,
        imageUrl: r.imageUrl,
        ingredients: r.ingredients,
        instructions: r.instructions,
        isBakerMode: r.isBakerMode,
      });
      setOpen(true);
    } catch (e) {
      showError(e, "APP-RCP-001");
    } finally {
      setLoading(false);
    }
  }

  // Preview data. For "mine" we already have emoji/time; for "official" we may
  // not — fall back to a neutral book icon.
  const mine = attached.source === "mine" ? recipes.find((r) => r.id === attached.id) : null;
  const emoji = mine?.emoji;
  const meta = mine ? `${mine.category || ""}${mine.timeMinutes ? ` · ${mine.timeMinutes} min` : ""}` : "Melik Bakery";

  return (
    <>
      <div className="mt-1 inline-flex w-full max-w-[280px] items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-2.5 shadow-sm">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary/10 text-2xl">
          {emoji ?? <BookOpen className="h-5 w-5 text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold leading-tight">
            {attached.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {attached.source === "official" && <Sparkles className="h-3 w-3 text-[color:var(--ochre)]" />}
            {meta}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          disabled={loading}
          aria-label={`Ver ${attached.title}`}
          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Ver
        </button>
      </div>

      {open && viewable && (
        <ViewRecipeModal recipe={viewable} onClose={() => setOpen(false)} readOnly />
      )}
    </>
  );
}
