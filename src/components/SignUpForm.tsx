import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { errorText } from "@/lib/errors/toast";
import { signup } from "@/lib/auth/auth.functions";
import { setSession } from "@/lib/auth/session-store";
import { PasswordChecklist, isPasswordStrong } from "@/components/PasswordChecklist";
import { UsernameField, type UsernameStatus } from "@/components/UsernameField";
import { USERNAME_REGEX } from "@/lib/username.functions";
import { AuthField, authInputClass } from "@/components/AuthField";

const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "Tu nombre"),
    lastName: z.string().trim().min(1, "Tu apellido"),
    username: z.string().regex(USERNAME_REGEX, "Nombre de usuario inválido"),
    email: z.string().trim().email("Correo inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
    accepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar la política" }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export default function SignUpForm({ redirectTo }: { redirectTo: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    accepted &&
    isPasswordStrong(password) &&
    password === confirm &&
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    usernameStatus === "available";

  // Clear any error banner as soon as the user edits any field.
  function clearOnChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      if (error) setError(null);
      setter(v);
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = signUpSchema.safeParse({ firstName, lastName, username, email, password, confirm, accepted });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }
    if (!isPasswordStrong(password)) {
      setError("La contraseña no cumple los requisitos");
      return;
    }
    if (usernameStatus !== "available") {
      setError("Elige un nombre de usuario disponible");
      return;
    }
    setLoading(true);
    try {
      const session = await signup({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), username, email, password },
      });
      setSession(session);
    } catch (err) {
      setLoading(false);
      setError(errorText(err));
      return;
    }
    setLoading(false);
    toast.success("Cuenta creada con éxito");
    await router.invalidate();
    navigate({ to: redirectTo });
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField label="Nombre">
          <input
            value={firstName}
            onChange={(e) => clearOnChange(setFirstName)(e.target.value)}
            required
            className={authInputClass}
          />
        </AuthField>
        <AuthField label="Apellido">
          <input
            value={lastName}
            onChange={(e) => clearOnChange(setLastName)(e.target.value)}
            required
            className={authInputClass}
          />
        </AuthField>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="username-input" className="text-xs font-medium text-foreground/80">
          Nombre de usuario
        </label>
        <UsernameField
          value={username}
          onChange={(v) => clearOnChange(setUsername)(v)}
          onStatusChange={setUsernameStatus}
        />
        <p className="rounded-xl bg-[color:var(--ochre)]/10 px-3 py-2 text-[11px] leading-snug text-foreground/80">
          ⚠️ Elige con cuidado: Tu nombre de usuario será tu identidad única en Melik Recipes y{" "}
          <strong>NO podrá ser modificado</strong> una vez creado.
        </p>
      </div>
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => clearOnChange(setPassword)(e.target.value)}
          required
          className={authInputClass}
        />
      </AuthField>
      <PasswordChecklist value={password} />
      <AuthField label="Confirmar contraseña">
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => clearOnChange(setConfirm)(e.target.value)}
          required
          className={authInputClass}
        />
        {confirm && confirm !== password && (
          <p className="mt-1 text-xs text-destructive">Las contraseñas no coinciden</p>
        )}
      </AuthField>

      <label className="flex items-start gap-2 rounded-2xl bg-card/60 p-3 text-xs">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => {
            if (error) setError(null);
            setAccepted(e.target.checked);
          }}
          className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
        />
        <span>
          Acepto los Términos de Servicio y la Política de Tratamiento de Datos Personales (Habeas Data).
        </span>
      </label>

      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="h-11 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Creando…" : "Registrarse"}
      </button>
    </form>
  );
}
