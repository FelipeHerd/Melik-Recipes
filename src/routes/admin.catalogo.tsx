import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, lazy, useMemo, useState } from "react";
import { Croissant, Lock, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminListOfficialRecipes,
  adminCreateOfficialRecipe,
  adminDeleteOfficialRecipe,
  updateRecipe,
  uploadRecipeImage,
  type AdminCatalogRow,
} from "@/lib/recipes.functions";
import { showError } from "@/lib/errors/toast";
import type { Recipe, NewRecipe } from "@/lib/recipes-context";

const RecipeFormModal = lazy(() =>
  import("@/components/RecipeFormModal").then((m) => ({ default: m.RecipeFormModal })),
);

import { assertAdminOrRedirect } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/catalogo")({
  beforeLoad: async ({ context }) => {
    await assertAdminOrRedirect((context as { queryClient?: any })?.queryClient);
  },
  head: () => ({
    meta: [
      { title: "Catálogo Melik — Panel" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminCatalogPage,
});


function AdminCatalogPage() {
  const listFn = useServerFn(adminListOfficialRecipes);
  const createFn = useServerFn(adminCreateOfficialRecipe);
  const updateFn = useServerFn(updateRecipe);
  const deleteFn = useServerFn(adminDeleteOfficialRecipe);
  const uploadFn = useServerFn(uploadRecipeImage);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "catalog"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows],
  );

  const uploadCover = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadFn({ data: fd });
    return res?.path ?? null;
  };

  const createMut = useMutation({
    mutationFn: async (r: NewRecipe) => {
      let imagePath: string | null = null;
      if (r.imageFile) imagePath = await uploadCover(r.imageFile);
      return createFn({
        data: {
          title: r.title,
          category: r.category,
          timeMinutes: r.timeMinutes,
          emoji: r.emoji ?? "🍽️",
          notes: "",
          ingredients: r.ingredients,
          instructions: r.instructions.map((s) => ({
            text: s.text,
            imagePath: s.imagePath ?? null,
          })),
          imagePath,
          isBakerMode: r.isBakerMode ?? false,
          isDraft: r.isDraft ?? false,
          isPublic: false,
          isOfficialMelik: true,
          isPremiumOnly: r.isPremiumOnly ?? false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Receta oficial creada");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      qc.invalidateQueries({ queryKey: ["official-recipes"] });
    },
    onError: (err) => showError(err, "APP-RCP-004"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, r }: { id: string; r: NewRecipe }) => {
      let imagePath: string | null | undefined = r.imagePath;
      if (r.imageFile) imagePath = await uploadCover(r.imageFile);
      return updateFn({
        data: {
          id,
          title: r.title,
          category: r.category,
          timeMinutes: r.timeMinutes,
          emoji: r.emoji ?? "🍽️",
          notes: "",
          ingredients: r.ingredients,
          instructions: r.instructions.map((s) => ({
            text: s.text,
            imagePath: s.imagePath ?? null,
          })),
          imagePath: imagePath ?? null,
          removedImagePaths: r.removedImagePaths ?? [],
          isBakerMode: r.isBakerMode ?? false,
          isDraft: false,
          isPublic: false,
          isOfficialMelik: true,
          isPremiumOnly: r.isPremiumOnly ?? false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Receta oficial actualizada");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      qc.invalidateQueries({ queryKey: ["official-recipes"] });
    },
    onError: (err) => showError(err, "APP-RCP-004"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Receta eliminada");
      qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      qc.invalidateQueries({ queryKey: ["official-recipes"] });
    },
    onError: (err) => showError(err, "APP-RCP-004"),
  });

  const editingAsRecipe: Recipe | undefined = editingRow
    ? adminRowToRecipe(editingRow)
    : undefined;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-900 text-primary">
            <Croissant className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Panel interno
            </p>
            <h1 className="font-display text-2xl font-semibold">Catálogo Melik</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva receta oficial
        </button>
      </div>

      <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-zinc-400">
            Aún no hay recetas en el catálogo. Crea la primera con el botón de arriba.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Título</th>
                <th className="px-4 py-3 text-left font-medium">Categoría</th>
                <th className="px-4 py-3 text-left font-medium">Tiempo</th>
                <th className="px-4 py-3 text-left font-medium">Acceso</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="text-zinc-200">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span aria-hidden>{r.emoji}</span>
                      <span className="font-medium">{r.title}</span>
                      {r.isDraft && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                          Borrador
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{r.category}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.timeMinutes} min</td>
                  <td className="px-4 py-3">
                    {r.isPremiumOnly ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                        <Lock className="h-3 w-3" /> Melik+
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Gratis</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(r.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar "${r.title}" del catálogo?`)) {
                            deleteMut.mutate(r.id);
                          }
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        <Link to="/admin" className="underline hover:text-zinc-300">
          ← Volver al panel
        </Link>
      </p>

      {creating && (
        <Suspense fallback={null}>
          <RecipeFormModal
            isAuthenticated
            adminMode
            onClose={() => setCreating(false)}
            onSave={async (r) => {
              await createMut.mutateAsync(r);
            }}
          />
        </Suspense>
      )}

      {editingAsRecipe && (
        <Suspense fallback={null}>
          <RecipeFormModal
            key={editingAsRecipe.id}
            initial={editingAsRecipe}
            isAuthenticated
            adminMode
            onClose={() => setEditingId(null)}
            onSave={async (r) => {
              await updateMut.mutateAsync({ id: editingAsRecipe.id, r });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function adminRowToRecipe(r: AdminCatalogRow): Recipe {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    timeMinutes: r.timeMinutes,
    emoji: r.emoji,
    imageUrl: r.imageUrl,
    imagePath: r.imagePath,
    createdAt: r.createdAt,
    ingredients: r.ingredients,
    instructions: r.instructions.map((s) => ({
      text: s.text,
      imagePath: s.imagePath ?? null,
      imageUrl: s.imageUrl ?? null,
    })),
    isBakerMode: false,
    isDraft: r.isDraft,
    isPublic: false,
    originalAuthor: null,
    isPremiumOnly: r.isPremiumOnly,
  };
}
