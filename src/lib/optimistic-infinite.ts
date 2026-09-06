// Vacuna 2: helpers tipados para actualizaciones optimistas seguras sobre
// TanStack InfiniteQuery. Nunca se debe hacer spread/map directo sobre un
// array plano cuando la caché está en formato `{ pages, pageParams }`.
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

export type Page<T> = { items: T[]; nextCursor: string | null };
export type InfiniteRecipes<T> = InfiniteData<Page<T>>;

type HasId = { id: string };

/**
 * Mapea todos los items de todas las páginas aplicando `fn` in-place.
 * Preserva la forma `{ pages, pageParams }` intacta.
 */
export function mapInfiniteItems<T>(
  data: InfiniteRecipes<T> | undefined,
  fn: (item: T) => T,
): InfiniteRecipes<T> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map(fn) })),
  };
}

/** Reemplaza un item por id en su página correspondiente. */
export function replaceInfiniteItem<T extends HasId>(
  data: InfiniteRecipes<T> | undefined,
  updated: T,
): InfiniteRecipes<T> | undefined {
  return mapInfiniteItems(data, (r) => (r.id === updated.id ? { ...r, ...updated } : r));
}

/** Filtra un item por id de todas las páginas. */
export function removeInfiniteItem<T extends HasId>(
  data: InfiniteRecipes<T> | undefined,
  id: string,
): InfiniteRecipes<T> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.filter((r) => r.id !== id) })),
  };
}

/** Antepone un item a la primera página (uso: creación optimista). */
export function prependInfiniteItem<T>(
  data: InfiniteRecipes<T> | undefined,
  item: T,
): InfiniteRecipes<T> | undefined {
  if (!data) {
    return {
      pages: [{ items: [item], nextCursor: null }],
      pageParams: [undefined as unknown as string],
    };
  }
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [{ ...first, items: [item, ...first.items] }, ...rest],
  };
}

/**
 * Snapshot + rollback: captura el estado actual antes de mutar y devuelve
 * un rollback para llamar en `onError` de useMutation.
 */
export function snapshotInfinite<T>(
  qc: QueryClient,
  key: QueryKey,
): { rollback: () => void; prev: InfiniteRecipes<T> | undefined } {
  const prev = qc.getQueryData<InfiniteRecipes<T>>(key);
  return {
    prev,
    rollback: () => {
      if (prev) qc.setQueryData(key, prev);
    },
  };
}
