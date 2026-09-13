import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { clearSession, useSessionUser } from "@/lib/auth/session-store";
import { getProfile } from "@/lib/recipes.functions";
// Served straight from public/ (see CLAUDE.md) — the Lovable-hosted asset
// manifest this used to import from is gone along with Lovable's CDN.
const melikBakeryLogo = { url: "/melik-bakery-logo.png" };
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export { useSessionUser };

export function initialsOf(first?: string | null, last?: string | null, email?: string | null) {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

export function UserMenu({ compact = false }: { compact?: boolean } = {}) {
  const { userId, ready } = useSessionUser();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile(),
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!ready) return <div className="h-10 w-10 rounded-full bg-card animate-pulse" aria-hidden />;

  if (!userId) {
    if (compact) {
      return (
        <Link
          to="/auth"
          aria-label="Iniciar sesión"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <LogIn className="h-4 w-4" />
        </Link>
      );
    }
    return (
      <Link
        to="/auth"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <LogIn className="h-4 w-4" /> Iniciar sesión
      </Link>
    );
  }


  const initials = initialsOf(profile?.first_name, profile?.last_name);
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mi cuenta";
  const username = profile?.username ?? null;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSession();
    await router.invalidate();
    navigate({ to: "/", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-2 ring-card hover:ring-primary/40"
          aria-label="Menú de cuenta"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          <div className="truncate">{fullName}</div>
          {username && (
            <div className="truncate text-xs font-normal text-muted-foreground">@{username}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex w-full items-center gap-2">
            <UserIcon className="h-4 w-4" /> Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/melik-plus" className="flex w-full items-center gap-2">
            <Crown className="h-4 w-4 text-[color:var(--ochre)]" /> Suscripción Melik+
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <a
            href="https://www.melikbakery.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            By Melik Bakery
          </a>
          <img
            src={melikBakeryLogo.url}
            alt="Melik Bakery"
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="h-7 w-7 shrink-0 object-contain"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Muestra "Nombre" + "@username" en el aside; se desvanece al contraer.
export function SidebarUsername({ collapsed }: { collapsed: boolean }) {
  const { userId, ready } = useSessionUser();
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile(),
    enabled: !!userId,
    staleTime: 60_000,
  });
  if (!ready || !userId) return null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mi cuenta";
  const username = profile?.username ?? null;
  return (
    <div
      aria-hidden={collapsed}
      className={`overflow-hidden text-center transition-all duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "max-h-0 opacity-0" : "max-h-16 opacity-100"
      }`}
    >
      <p className="truncate text-sm font-medium text-foreground">{fullName}</p>
      {username && (
        <p className="truncate text-xs text-muted-foreground">@{username}</p>
      )}
    </div>
  );
}
