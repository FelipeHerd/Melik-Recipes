// In-chat card that lets the user approve an AI-generated recipe draft and
// persist it into their private "Mis recetas" catalog.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookmarkPlus, Check, ChefHat, Clock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { createRecipe } from "@/lib/recipes.functions";
import { emojiFor } from "@/lib/categories";
import type { RecipeDraft } from "@/lib/discover-recipe-parser";

export function RecipeDraftCard({ draft }: { draft: RecipeDraft }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const emoji = draft.emoji && draft.emoji.trim() ? draft.emoji : emojiFor(draft.category);
      const { id } = await createRecipe({
        data: {
          title: draft.title,
          category: draft.category,
          emoji,
          timeMinutes: draft.timeMinutes,
          notes: draft.notes ?? "",
          ingredients: draft.ingredients.map((i) => ({
            quantity: i.quantity ?? "",
            unit: i.unit ?? "",
            name: i.name,
          })),
          instructions: draft.instructions.map((s) => ({
            text: s.text,
            imagePath: null,
          })),
          imagePath: null,
          isBakerMode: false,
        },
      });
      return id;
    },
    onSuccess: async (id) => {
      setSavedId(id);
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Receta guardada en Mis recetas");
    },
    onError: (e) => {
      showError(e, "APP-RCP-004");
    },
  });

  if (dismissed) return null;

  const displayEmoji = draft.emoji?.trim() || emojiFor(draft.category);
  const isSaved = savedId !== null;
  const isPending = saveMut.isPending;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-primary/25 bg-background/70 shadow-sm">
      <div className="flex items-start gap-3 p-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary/10 text-2xl">
          {displayEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
            Receta sugerida
          </p>
          <h4 className="truncate font-display text-base font-semibold">{draft.title}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ChefHat className="h-3 w-3" /> {draft.category}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {draft.timeMinutes} min
            </span>
            <span>
              {draft.ingredients.length} ingredientes · {draft.instructions.length} pasos
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-card/40 px-3 py-2">
        {isSaved ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <Check className="h-3.5 w-3.5" /> Guardada en Mis recetas
            </span>
            <Link
              to="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Ver mis recetas
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              disabled={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Descartar
            </button>
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={isPending}
              aria-busy={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-3.5 w-3.5" /> Aprobar y guardar
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
