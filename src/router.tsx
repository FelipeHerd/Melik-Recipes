import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Pilar 3: navegación entre tabs sin refetch agresivo.
        // Las mutaciones invalidan explícitamente las claves afectadas.
        staleTime: 3 * 60_000, // 3 min "fresco"
        gcTime: 15 * 60_000, // 15 min en memoria tras último uso
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Precarga el chunk + loader de la ruta al hover / touchstart / focus
    // del <Link>. Es la mayor mejora percibida al abrir /descubrir por 1ª vez.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });


  return router;
};
