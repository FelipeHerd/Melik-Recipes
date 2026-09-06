import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — Melik Recipes" },
      { name: "description", content: "Solicita un enlace para restablecer la contraseña de tu cuenta en Melik Recipes." },
      { property: "og:title", content: "Recuperar contraseña — Melik Recipes" },
      { property: "og:url", content: "https://melik-recipes.lovable.app/auth/reset" },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/auth/reset" }],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/auth/update-password",
      });
    } catch {
      // swallow — same UX either way
    }
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <div className="mt-6 rounded-3xl border border-border bg-card/40 p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl font-semibold">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Te enviaremos un enlace para crear una nueva contraseña.
          </p>

          {sent ? (
            <div className="mt-6 rounded-2xl bg-primary/10 p-4 text-sm text-foreground">
              Si tu correo está registrado, te enviamos un enlace de recuperación. Revisa tu bandeja de entrada y la
              carpeta de spam.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground/80">Correo</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="h-11 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Enviando…" : "Enviar enlace"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
