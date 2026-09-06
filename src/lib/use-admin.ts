import { useQuery } from "@tanstack/react-query";
import { useSessionUser } from "@/components/UserMenu";
import { checkIsAdmin } from "@/lib/admin.functions";

/** Consulta el rol privilegiado del usuario actual.
 *  Nota: `admin` y `dev` son roles distintos. Solo `isAdmin` habilita el panel /admin.
 *  `isDev` habilita herramientas internas de desarrollador dentro del propio perfil.
 *  Sin cache stale: si un admin es degradado, el botón/panel desaparecen al instante. */
export function useIsAdmin() {
  const { userId, ready } = useSessionUser();
  const query = useQuery({
    queryKey: ["is-admin", userId ?? "guest"],
    queryFn: () => checkIsAdmin(),
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return {
    isAdmin: !!userId && !!query.data?.isAdmin,
    isDev: !!userId && !!query.data?.isDev,
    role: query.data?.role ?? "user",
    isLoading: !ready || (!!userId && query.isPending),
    refetch: query.refetch,
  };
}
