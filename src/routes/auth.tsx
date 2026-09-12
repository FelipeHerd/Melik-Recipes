import { createFileRoute, Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { login } from "@/lib/auth/auth.functions";
import { setSession } from "@/lib/auth/session-store";
import { AuthField, authInputClass } from "@/components/AuthField";
import { AuthPageSkeleton, AuthSkeleton } from "@/components/AuthSkeleton";
import melikLogo from "@/assets/melik-logo.png.asset.json";

// Only allow relative in-app paths as redirect target to prevent open-redirect abuse.
function safeRedirect(v: unknown): string {
  if (typeof v !== "string") return "/";
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

const importSignUpForm = () => import("@/components/SignUpForm");
const SignUpForm = lazy(importSignUpForm);

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Melik Recipes" },
      { name: "description", content: "Inicia sesión en Melik Recipes para acceder a tu recetario personal y sincronizar tus datos." },
      { property: "og:title", content: "Iniciar sesión — Melik Recipes" },
      { property: "og:description", content: "Accede a tu recetario personal y sincroniza tus recetas en la nube." },
      { property: "og:url", content: "https://melik-recipes.lovable.app/auth" },
    ],
    links: [
      { rel: "canonical", href: "https://melik-recipes.lovable.app/auth" },
      { rel: "preload", as: "image", href: melikLogo.url },
    ],
  }),
  pendingMs: 0,
  pendingComponent: AuthPageSkeleton,
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const redirectTo = safeRedirect(search.redirect);
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <div className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-card overflow-hidden">
            <img src={melikLogo.url} alt="Melik Recipes" decoding="async" className="h-10 w-10 object-contain" />
          </span>
          <span className="font-display text-xl font-semibold leading-tight">Melik<br />Recipes</span>
        </Link>
        <div className="mt-8 rounded-3xl border border-border bg-card/40 p-6 shadow-sm sm:p-8">
          <div className="flex rounded-2xl bg-card p-1 text-sm font-medium">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 rounded-xl px-4 py-2 transition ${tab === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setTab("signup")}
              onMouseEnter={importSignUpForm}
              onFocus={importSignUpForm}
              onTouchStart={importSignUpForm}
              className={`flex-1 rounded-xl px-4 py-2 transition ${tab === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Crear cuenta
            </button>
          </div>

          {tab === "login" ? (
            <LoginForm redirectTo={redirectTo} />
          ) : (
            <Suspense fallback={<AuthSkeleton variant="signup" />}>
              <SignUpForm redirectTo={redirectTo} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ redirectTo }: { redirectTo: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wraps a setter so that any user input clears an active error message.
  function clearOnChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      if (error) setError(null);
      setter(v);
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setLoading(true);
    try {
      const session = await login({ data: { email, password } });
      setSession(session);
    } catch {
      setLoading(false);
      setError("Correo o contraseña incorrectos");
      return;
    }
    setLoading(false);
    toast.success("¡Bienvenido de vuelta!");
    await router.invalidate();
    navigate({ to: redirectTo });
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <AuthField label="Correo">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => clearOnChange(setEmail)(e.target.value)}
          required
          className={authInputClass}
        />
      </AuthField>
      <AuthField label="Contraseña">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => clearOnChange(setPassword)(e.target.value)}
          required
          className={authInputClass}
        />
      </AuthField>
      <Link to="/auth/reset" className="text-right text-xs font-medium text-primary hover:underline">
        ¿Olvidaste tu contraseña?
      </Link>
      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="h-11 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
