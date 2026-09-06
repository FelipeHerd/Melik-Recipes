import { useEffect, useRef } from "react";

/**
 * Observa un elemento sentinela y dispara `onIntersect` cuando entra en el
 * viewport. Ideal para cargar el siguiente lote en Infinite Queries.
 */
export function useInfiniteSentinel(
  onIntersect: () => void,
  {
    enabled = true,
    rootMargin = "600px",
  }: { enabled?: boolean; rootMargin?: string } = {},
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onIntersect);
  cbRef.current = onIntersect;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) cbRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return ref;
}
