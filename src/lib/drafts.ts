import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import {
  listDrafts,
  saveDraft as saveDraftFn,
  deleteRecipe as deleteRecipeFn,
  uploadRecipeImage,
  type RecipesPage,
} from "@/lib/recipes.functions";
import type { Recipe } from "@/lib/recipes-context";

export function useDrafts(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["drafts"] as const,
    queryFn: () => listDrafts(),
    enabled,
    staleTime: 15_000,
  });
  const drafts: Recipe[] = (query.data?.items ?? []) as Recipe[];
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["drafts"] });
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
  }, [queryClient]);
  const deleteDraft = useCallback(
    async (id: string) => {
      try {
        await deleteRecipeFn({ data: { id } });
        toast.success("Borrador eliminado");
      } catch (err) {
        showError(err);
      } finally {
        invalidate();
      }
    },
    [invalidate],
  );
  return {
    drafts,
    count: drafts.length,
    isLoading: query.isPending && enabled,
    invalidate,
    deleteDraft,
  };
}

export type DraftSavePayload = {
  id: string | null;
  title: string;
  category: string;
  timeMinutes: number;
  emoji: string;
  ingredients: { quantity: string; unit: string; name: string }[];
  instructions: { text: string; imagePath: string | null }[];
  imagePath: string | null;
  isBakerMode: boolean;
  imageFile?: File | null;
};

/**
 * Autosave a draft. Uploads the cover image if provided (before insert/update).
 * Returns the row id — callers MUST persist it locally so subsequent saves UPDATE.
 */
export async function persistDraft(payload: DraftSavePayload): Promise<string> {
  let imagePath: string | null = payload.imagePath;
  if (payload.imageFile) {
    const fd = new FormData();
    fd.append("file", payload.imageFile);
    const uploaded = await uploadRecipeImage({ data: fd });
    imagePath = uploaded.path;
  }
  const res = await saveDraftFn({
    data: {
      id: payload.id,
      title: payload.title,
      category: payload.category,
      timeMinutes: payload.timeMinutes,
      emoji: payload.emoji,
      ingredients: payload.ingredients,
      instructions: payload.instructions,
      imagePath,
      isBakerMode: payload.isBakerMode,
      notes: "",
    },
  });
  return res.id;
}

export type DraftPage = RecipesPage;
