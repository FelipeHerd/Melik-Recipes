import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { getSession, subscribeSession } from "@/lib/auth/session-store";
import {
  listRecipes,
  createRecipe as createRecipeFn,
  deleteRecipe as deleteRecipeFn,
  updateRecipe as updateRecipeFn,
  migrateGuestRecipes,
  uploadRecipeImage,
  type RecipesPage,
} from "@/lib/recipes.functions";
import { parseIngredients, parseSteps, type Ingredient, type Step } from "@/lib/recipe-format";
import { prependInfiniteItem, removeInfiniteItem, replaceInfiniteItem, snapshotInfinite } from "@/lib/optimistic-infinite";

export type { Ingredient, Step } from "@/lib/recipe-format";

export type Recipe = {
  id: string;
  title: string;
  ingredients: Ingredient[];
  instructions: Step[];
  category: string;
  timeMinutes: number;
  createdAt: number;
  emoji: string;
  imageUrl: string | null;
  imagePath: string | null;
  isBakerMode: boolean;
  isDraft: boolean;
  isPublic: boolean;
  originalAuthor: string | null;
  isPremiumOnly?: boolean;
};

export type NewRecipe = Omit<
  Recipe,
  "id" | "createdAt" | "emoji" | "imageUrl" | "imagePath" | "isBakerMode" | "isDraft" | "isPublic" | "originalAuthor"
> & {
  emoji?: string;
  isBakerMode?: boolean;
  isDraft?: boolean;
  isPublic?: boolean;
  imageFile?: File | null;
  /** When editing: existing cover path to keep (undefined = keep as-is, null = remove). */
  imagePath?: string | null;
  /** Original author to preserve on cloned recipes (never mutated by updates). */
  originalAuthor?: string | null;
  /** Image paths that were previously attached but the user removed while editing. */
  removedImagePaths?: string[];
  /** Admin-only flags. Server strips these silently for non-admins. */
  isOfficialMelik?: boolean;
  isPremiumOnly?: boolean;
};

const GUEST_KEY = "meliks.recipes.guest.v1";
const LEGACY_KEY = "meliks.recipes.v1";
const MAX_GUEST_IMAGE_BYTES = 1_000_000; // ~1 MB — keep localStorage sane

function normalizeGuestRecipe(raw: unknown): Recipe | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string") return null;
  return {
    id: r.id,
    title: r.title,
    ingredients: parseIngredients(r.ingredients),
    instructions: parseSteps(r.instructions),
    category: typeof r.category === "string" ? r.category : "Otro",
    timeMinutes: typeof r.timeMinutes === "number" ? r.timeMinutes : 0,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    emoji: typeof r.emoji === "string" ? r.emoji : "🍽️",
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null,
    imagePath: typeof r.imagePath === "string" ? r.imagePath : null,
    isBakerMode: typeof r.isBakerMode === "boolean" ? r.isBakerMode : false,
    isDraft: false,
    isPublic: false,
    originalAuthor: null,
  };
}

function loadGuest(): Recipe[] {
  if (typeof window === "undefined") return [];
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeGuestRecipe).filter((r): r is Recipe => r !== null);
  } catch {
    clearGuestStorage();
    return [];
  }
}

function saveGuest(recipes: Recipe[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(recipes));
  } catch {
    /* ignore quota */
  }
}

function clearGuestStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

type Ctx = {
  recipes: Recipe[];
  addRecipe: (r: NewRecipe) => Promise<void>;
  updateRecipe: (id: string, r: NewRecipe) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMore: () => void;
  pendingGuestMigration: Recipe[];
  confirmMigration: () => Promise<number>;
  discardMigration: () => void;
};

const RecipesContext = createContext<Ctx | null>(null);

export function RecipesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guest, setGuest] = useState<Recipe[]>(() => loadGuest());
  const [pendingGuestMigration, setPendingGuestMigration] = useState<Recipe[]>([]);

  useEffect(() => {
    const initialUid = getSession()?.userId ?? null;
    setUserId(initialUid);
    setAuthReady(true);
    // On initial load: if user already authenticated and there are guest leftovers, prompt.
    if (initialUid) {
      const pending = loadGuest();
      if (pending.length > 0) setPendingGuestMigration(pending);
    }

    let previousId = initialUid;
    return subscribeSession(() => {
      const newId = getSession()?.userId ?? null;
      if (newId === previousId) return;
      const wasSignedIn = !!previousId;
      previousId = newId;
      setUserId(newId);
      if (newId && !wasSignedIn) {
        const pending = loadGuest();
        if (pending.length > 0) {
          setPendingGuestMigration(pending);
        }
        // Descarta cualquier residuo del usuario anterior en la misma pestaña
        // ANTES de refetch, para evitar flashes de datos cruzados.
        queryClient.removeQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
      if (!newId) {
        setPendingGuestMigration([]);
        queryClient.removeQueries({ queryKey: ["recipes"] });
        queryClient.removeQueries({ queryKey: ["profile"] });
        queryClient.removeQueries({ queryKey: ["notifications"] });
      }
    });
  }, [queryClient]);

  useEffect(() => {
    if (!authReady) return;
    if (userId) return;
    saveGuest(guest);
  }, [guest, userId, authReady]);

  const PAGE_SIZE = 12;
  const recipesQueryKey = useMemo(() => ["recipes", userId] as const, [userId]);

  const cloudQuery = useInfiniteQuery({
    queryKey: recipesQueryKey,
    queryFn: ({ pageParam }) =>
      listRecipes({ data: { cursor: pageParam ?? null, limit: PAGE_SIZE } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!userId,
    staleTime: 30_000,
  });

  const cloudRecipes = useMemo(
    () => cloudQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [cloudQuery.data],
  );

  const recipes: Recipe[] = userId ? cloudRecipes : guest;
  const isLoading = !!userId && cloudQuery.isPending;
  const hasMore = !!userId && !!cloudQuery.hasNextPage;
  const isFetchingMore = !!userId && cloudQuery.isFetchingNextPage;
  const loadMore = useCallback(() => {
    if (cloudQuery.hasNextPage && !cloudQuery.isFetchingNextPage) {
      void cloudQuery.fetchNextPage();
    }
  }, [cloudQuery]);

  const addRecipe: Ctx["addRecipe"] = useCallback(
    async (r) => {
      const emoji = r.emoji ?? "🍽️";
      const { imageFile, ...rest } = r;

      if (userId) {
        let imagePath: string | null = null;
        if (imageFile) {
          const fd = new FormData();
          fd.append("file", imageFile);
          const uploaded = await uploadRecipeImage({ data: fd });
          imagePath = uploaded.path;
        }
        try {
          await createRecipeFn({
            data: {
              title: rest.title,
              ingredients: rest.ingredients,
              instructions: rest.instructions.map((s) => ({ text: s.text, imagePath: s.imagePath ?? null })),
              category: rest.category,
              timeMinutes: rest.timeMinutes,
              emoji,
              notes: "",
              imagePath,
              isBakerMode: !!rest.isBakerMode,
              isDraft: !!rest.isDraft,
              ...(typeof rest.isPublic === "boolean" ? { isPublic: rest.isPublic } : {}),
            },
          });
          toast.success("Receta guardada");
        } catch (err) {
          showError(err, "APP-RCP-004");
          throw err;
        } finally {
          queryClient.invalidateQueries({ queryKey: ["recipes"] });
          queryClient.invalidateQueries({ queryKey: ["drafts"] });
        }
      } else {
        let imageUrl: string | null = null;
        if (imageFile) {
          if (imageFile.size > MAX_GUEST_IMAGE_BYTES) {
            throw new Error(
              "Como invitado la imagen debe pesar menos de 1 MB. Inicia sesión para subir imágenes más grandes.",
            );
          }
          imageUrl = await readFileAsDataUrl(imageFile);
        }
        setGuest((prev) => [
          {
            ...rest,
            emoji,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            imageUrl,
            imagePath: null,
            isBakerMode: !!rest.isBakerMode,
            isDraft: false,
            isPublic: false,
            originalAuthor: null,
          },
          ...prev,
        ]);
      }
    },
    [userId, queryClient],
  );

  const deleteRecipe: Ctx["deleteRecipe"] = useCallback(
    async (id) => {
      if (userId) {
        // Pilar 1 + Vacuna 2: optimistic remove sobre InfiniteData.
        const key = ["recipes", userId] as const;
        await queryClient.cancelQueries({ queryKey: key });
        const { rollback } = snapshotInfinite<Recipe>(queryClient, key);
        queryClient.setQueryData<InfiniteData<RecipesPage>>(key, (old) =>
          removeInfiniteItem(old, id),
        );
        try {
          await deleteRecipeFn({ data: { id } });
          toast.success("Receta eliminada");
        } catch (err) {
          rollback();
          showError(err);
          throw err;
        } finally {
          queryClient.invalidateQueries({ queryKey: ["recipes"] });
          queryClient.invalidateQueries({ queryKey: ["drafts"] });
        }
      } else {
        setGuest((prev) => prev.filter((r) => r.id !== id));
      }
    },
    [userId, queryClient],
  );

  const confirmMigration: Ctx["confirmMigration"] = useCallback(async () => {
    if (pendingGuestMigration.length === 0) return 0;

    const recipesToMigrate = pendingGuestMigration.slice(0, 500);

    // Upload any embedded data-URL images so they persist in cloud storage.
    // If imageUrl is already a HTTP/HTTPS URL or missing, skip base64 blob conversion and retain existing URL.
    const withUploads = await Promise.all(
      recipesToMigrate.map(async (r) => {
        const url = r.imageUrl;
        let imagePath: string | null = r.imagePath ?? (url && !url.startsWith("data:") ? url : null);

        if (url && url.startsWith("data:")) {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            const ext = (blob.type.split("/")[1] || "jpg").split(";")[0];
            const file = new File([blob], `guest.${ext}`, { type: blob.type || "image/jpeg" });
            const fd = new FormData();
            fd.append("file", file);
            const uploaded = await uploadRecipeImage({ data: fd });
            imagePath = uploaded.path;
          } catch {
            imagePath = r.imagePath ?? null;
          }
        }
        return {
          title: r.title,
          ingredients: r.ingredients,
          instructions: r.instructions.map((s) => ({ text: s.text, imagePath: s.imagePath ?? null })),
          category: r.category,
          timeMinutes: r.timeMinutes,
          emoji: r.emoji,
          notes: "",
          imagePath,
          isBakerMode: r.isBakerMode,
          isPublic: r.isPublic ?? false,
        };
      }),
    );

    const result = await migrateGuestRecipes({ data: { recipes: withUploads } });

    // Success — clear local state and storage.
    clearGuestStorage();
    setGuest([]);
    setPendingGuestMigration([]);
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
    return result.inserted ?? recipesToMigrate.length;
  }, [pendingGuestMigration, queryClient]);

  const discardMigration: Ctx["discardMigration"] = useCallback(() => {
    clearGuestStorage();
    setGuest([]);
    setPendingGuestMigration([]);
  }, []);

  const updateRecipe: Ctx["updateRecipe"] = useCallback(
    async (id, r) => {
      const emoji = r.emoji ?? "🍽️";
      const { imageFile, removedImagePaths = [], ...rest } = r;

      if (userId) {
        // Preserve existing cover unless a new file is chosen.
        let imagePath: string | null | undefined = undefined;
        if (imageFile) {
          const fd = new FormData();
          fd.append("file", imageFile);
          const uploaded = await uploadRecipeImage({ data: fd });
          imagePath = uploaded.path;
        }
        const key = ["recipes", userId] as const;
        const existing = (
          queryClient.getQueryData<InfiniteData<RecipesPage>>(key)?.pages.flatMap((p) => p.items) ??
          []
        ).find((x) => x.id === id);
        const finalCover =
          imagePath !== undefined ? imagePath : rest.imagePath !== undefined ? rest.imagePath : existing?.imagePath ?? null;

        // Pilar 1 + Vacuna 2: optimistic replace sobre InfiniteData.
        await queryClient.cancelQueries({ queryKey: key });
        const { rollback } = snapshotInfinite<Recipe>(queryClient, key);
        if (existing) {
          const optimistic: Recipe = {
            ...existing,
            title: rest.title,
            ingredients: rest.ingredients,
            instructions: rest.instructions,
            category: rest.category,
            timeMinutes: rest.timeMinutes,
            emoji,
            imagePath: finalCover,
            isBakerMode: rest.isBakerMode ?? existing.isBakerMode,
          };
          queryClient.setQueryData<InfiniteData<RecipesPage>>(key, (old) =>
            replaceInfiniteItem(old, optimistic),
          );
        }
        try {
          await updateRecipeFn({
            data: {
              id,
              title: rest.title,
              ingredients: rest.ingredients,
              instructions: rest.instructions.map((s) => ({ text: s.text, imagePath: s.imagePath ?? null })),
              category: rest.category,
              timeMinutes: rest.timeMinutes,
              emoji,
              notes: "",
              imagePath: finalCover,
              isBakerMode: !!rest.isBakerMode,
              removedImagePaths,
              ...(typeof rest.isDraft === "boolean" ? { isDraft: rest.isDraft } : {}),
              ...(typeof rest.isPublic === "boolean" ? { isPublic: rest.isPublic } : {}),
            },
          });
          toast.success("Receta actualizada");
        } catch (err) {
          rollback();
          showError(err, "APP-RCP-004");
          throw err;
        } finally {
          queryClient.invalidateQueries({ queryKey: ["recipes"] });
          queryClient.invalidateQueries({ queryKey: ["drafts"] });
        }
      } else {
        let imageUrl: string | null | undefined = undefined;
        if (imageFile) {
          if (imageFile.size > MAX_GUEST_IMAGE_BYTES) {
            throw new Error(
              "Como invitado la imagen debe pesar menos de 1 MB. Inicia sesión para subir imágenes más grandes.",
            );
          }
          imageUrl = await readFileAsDataUrl(imageFile);
        }
        setGuest((prev) =>
          prev.map((existing) => {
            if (existing.id !== id) return existing;
            return {
              ...existing,
              title: rest.title,
              ingredients: rest.ingredients,
              instructions: rest.instructions,
              category: rest.category,
              timeMinutes: rest.timeMinutes,
              emoji,
              imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
              isBakerMode: rest.isBakerMode ?? existing.isBakerMode,
            };
          }),
        );
      }
    },
    [userId, queryClient],
  );

  return (
    <RecipesContext.Provider
      value={{
        recipes,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        isAuthenticated: !!userId,
        isLoading,
        hasMore,
        isFetchingMore,
        loadMore,
        pendingGuestMigration,
        confirmMigration,
        discardMigration,
      }}
    >
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes() {
  const ctx = useContext(RecipesContext);
  if (!ctx) throw new Error("useRecipes must be used within RecipesProvider");
  return ctx;
}
