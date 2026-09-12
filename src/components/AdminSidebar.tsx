import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Users, Croissant, ArrowLeft, LogOut, Shield, Bell } from "lucide-react";
import { clearSession } from "@/lib/auth/session-store";

const items = [
  { to: "/admin", label: "Métricas", icon: BarChart3, exact: true },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, exact: false },
  { to: "/admin/catalogo", label: "Catálogo Melik", icon: Croissant, exact: false },
  { to: "/admin/notificaciones", label: "Notificaciones", icon: Bell, exact: false },
] as const;

export function AdminSidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSession();
    navigate({ to: "/auth-admin", replace: true });
  }

  return (
    <aside className="hidden md:flex sticky top-0 h-dvh w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-6">
      <div className="flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Shield className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Panel Melik</p>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Interno</p>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-zinc-800 pt-4">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a la app
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
