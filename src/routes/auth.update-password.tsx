import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors/toast";
import { supabase } from "@/integrations/supabase/client";
import { PasswordChecklist, isPasswordStrong } from "@/components/PasswordChecklist";

export const Route = createFileRoute("/auth/update-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Melik Recipes" },
      { name: "description", content: "Elige una nueva contraseña segura para tu cuenta de Melik Recipes." },
      { property: "og:title", content: "Nueva contraseña — Melik Recipes" },
      { property: "og:url", content: "https://melik-recipes.lovable.app/auth/update-password" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/auth/update-password" }],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordStrong(password)) {
      setError("La contraseña no cumple los requisitos");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(errorText(error));
      return;
    }
    toast.success("Contraseña actualizada");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
          Volver
        </Link>
        <div className="mt-6 rounded-3xl border border-border bg-card/40 p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl font-semibold">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crea una contraseña segura para tu cuenta.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground/80">Contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <PasswordChecklist value={password} />
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground/80">Confirmar contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
