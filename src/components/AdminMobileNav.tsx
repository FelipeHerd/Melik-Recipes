import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Users,
  Croissant,
  ArrowLeft,
  LogOut,
  Shield,
  Bell,
  Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const items = [
  { to: "/admin", label: "Métricas", icon: BarChart3, exact: true },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, exact: false },
  { to: "/admin/catalogo", label: "Catálogo Melik", icon: Croissant, exact: false },
  { to: "/admin/notificaciones", label: "Notificaciones", icon: Bell, exact: false },
] as const;

export function AdminMobileNav() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setOpen(false);
    navigate({ to: "/auth-admin", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Shield className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">Panel Melik</p>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Interno</p>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú de administración"
            className="grid h-9 w-9 place-items-center rounded-xl text-zinc-100 transition hover:bg-zinc-900"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>

        <SheetContent
          side="right"
          className="flex w-[280px] flex-col border-zinc-800 bg-zinc-950 p-0"
        >
          <div className="flex items-center gap-2.5 border-b border-zinc-800 px-4 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-left text-sm font-semibold text-zinc-100">
                Panel Melik
              </SheetTitle>
              <SheetDescription className="text-left text-[11px] uppercase tracking-widest text-zinc-500">
                Interno
              </SheetDescription>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-1">
              {items.map((it) => {
                const active = it.exact
                  ? pathname === it.to
                  : pathname.startsWith(it.to);
                const Icon = it.icon;
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                        active
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-zinc-800 px-3 py-4">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" /> Volver a la app
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
            >
              <LogOut className="h-4 w-4 shrink-0" /> Cerrar sesión
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
