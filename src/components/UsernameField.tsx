import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Check, Loader2, X } from "lucide-react";
import { checkUsernameAvailable, isValidUsername } from "@/lib/username.functions";

export type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

// eslint-disable-next-line react-refresh/only-export-components -- shared helper colocated with the component that uses it
export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 20);
}

// eslint-disable-next-line react-refresh/only-export-components -- shared hook colocated with the component that uses it
export function useUsernameAvailability(username: string) {
  const [debounced, setDebounced] = useState(username);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(username), 500);
    return () => clearTimeout(t);
  }, [username]);

  const validFormat = isValidUsername(debounced);

  const query = useQuery({
    queryKey: ["username-availability", debounced],
    queryFn: () => checkUsernameAvailable({ data: { username: debounced } }),
    enabled: validFormat,
    staleTime: 30_000,
    retry: false,
  });

  let status: UsernameStatus = "idle";
  if (!username) status = "idle";
  else if (username !== debounced) status = "checking";
  else if (!validFormat) status = "invalid";
  else if (query.isFetching) status = "checking";
  else if (query.data?.available) status = "available";
  else if (query.data && !query.data.available) status = "taken";

  return { status, debounced };
}

export function UsernameField({
  value,
  onChange,
  onStatusChange,
  autoFocus,
  disabled,
  id = "username-input",
}: {
  value: string;
  onChange: (next: string) => void;
  onStatusChange?: (status: UsernameStatus) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const { status } = useUsernameAvailability(value);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const ringColor =
    status === "available"
      ? "focus-within:ring-green-500/40 border-green-500/60"
      : status === "taken" || status === "invalid"
        ? "focus-within:ring-destructive/40 border-destructive/60"
        : "focus-within:ring-ring border-border";

  return (
    <div className="grid gap-1.5">
      <div
        className={`flex h-11 items-center gap-2 rounded-xl border bg-background pr-3 transition focus-within:outline-none focus-within:ring-2 ${ringColor} ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <span className="grid h-full w-11 flex-none place-items-center rounded-l-xl bg-card text-sm font-semibold text-foreground/80">
          <AtSign className="h-4 w-4" />
        </span>
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          inputMode="text"
          value={value}
          onChange={(e) => onChange(normalizeUsername(e.target.value))}
          placeholder="tunombre"
          maxLength={20}
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <span className="grid h-6 w-6 place-items-center">
          {status === "checking" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {status === "available" && <Check className="h-4 w-4 text-green-600" />}
          {(status === "taken" || status === "invalid") && value && (
            <X className="h-4 w-4 text-destructive" />
          )}
        </span>
      </div>
      <p aria-live="polite" className="min-h-[1.15rem] text-xs">
        {status === "available" && (
          <span className="text-green-600">✅ Nombre de usuario disponible</span>
        )}
        {status === "taken" && (
          <span className="text-destructive">❌ Este nombre de usuario ya está ocupado</span>
        )}
        {status === "invalid" && value && (
          <span className="text-destructive">
            Usa 3–20 caracteres: minúsculas, números, punto o guion bajo (sin punto al inicio/fin ni
            dobles)
          </span>
        )}
        {status === "checking" && (
          <span className="text-muted-foreground">Comprobando disponibilidad…</span>
        )}
        {status === "idle" && !value && (
          <span className="text-muted-foreground">
            Minúsculas, números, punto y guion bajo (3–20)
          </span>
        )}
      </p>
    </div>
  );
}
