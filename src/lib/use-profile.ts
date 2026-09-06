// Guest-safe premium profile hook.
// When the user is not authenticated, returns { isPremium: false } WITHOUT
// hitting the network. This keeps the paywall / bakery gate working for
// invitados without spurious 401s.

import { useQuery } from "@tanstack/react-query";
import { useSessionUser } from "@/components/UserMenu";
import { getProfile } from "@/lib/recipes.functions";

export function useProfile() {
  const { userId, ready } = useSessionUser();
  const query = useQuery({
    queryKey: ["profile", userId ?? "guest"],
    queryFn: () => getProfile(),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const isAuthenticated = !!userId;
  const isPremium = isAuthenticated ? !!query.data?.is_premium : false;
  const role = (query.data?.role ?? "user") as "user" | "admin" | "dev";
  const kikoBlockedUntil = query.data?.kiko_blocked_until ?? null;
  const premiumUntil = query.data?.premium_until ?? null;

  return {
    userId,
    isAuthenticated,
    isPremium,
    role,
    kikoBlockedUntil,
    premiumUntil,
    profile: query.data ?? null,
    isLoading: !ready || (isAuthenticated && query.isPending),
    refetch: query.refetch,
  };
}
