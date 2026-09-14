import { Check, X } from "lucide-react";

export const PASSWORD_RULES = [
  { id: "len", label: "Al menos 8 caracteres", test: (s: string) => s.length >= 8 },
  { id: "upper", label: "Una mayúscula", test: (s: string) => /[A-Z]/.test(s) },
  { id: "lower", label: "Una minúscula", test: (s: string) => /[a-z]/.test(s) },
  { id: "num", label: "Un número", test: (s: string) => /\d/.test(s) },
  { id: "sym", label: "Un carácter especial", test: (s: string) => /[^A-Za-z0-9]/.test(s) },
] as const;

// eslint-disable-next-line react-refresh/only-export-components -- shared helper colocated with the component that uses it
export function isPasswordStrong(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid gap-1 text-xs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li
            key={r.id}
            className={"flex items-center gap-2 " + (ok ? "text-primary" : "text-muted-foreground")}
          >
            <span
              className={
                "grid h-4 w-4 place-items-center rounded-full " +
                (ok ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")
              }
              aria-hidden
            >
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
