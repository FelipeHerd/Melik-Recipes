// Avatar shown next to a user's chat bubble.
// - Authenticated: profile photo or initials fallback.
// - Guest: generic person icon (preserves current look).
import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { useSessionUser, initialsOf } from "@/components/UserMenu";
import { getProfile } from "@/lib/recipes.functions";

export function UserAvatarBubble() {
  const { userId, ready } = useSessionUser();
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile(),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const base =
    "grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-2xl bg-[color:var(--ochre)] text-foreground text-xs font-semibold";

  if (!ready || !userId) {
    return (
      <span className={base}>
        <User className="h-4 w-4" />
      </span>
    );
  }

  if (profile?.avatar_url) {
    return (
      <span className={base}>
        <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </span>
    );
  }

  const initials = initialsOf(profile?.first_name, profile?.last_name);
  return <span className={base}>{initials}</span>;
}
