import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Clock, Copy, Crown, ExternalLink, Shield, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  setKikoBlock,
  grantTrial,
  setUserRole,
  generateImpersonationLink,
  type AdminCrmRow,
} from "@/lib/admin-crm.functions";
import { showError } from "@/lib/errors/toast";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Ban;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger" | "ghost";
  children: React.ReactNode;
}) {
  const cls =
    variant === "danger"
      ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
      : variant === "ghost"
        ? "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800"
        : "bg-primary/15 text-primary hover:bg-primary/25";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

export function UserActionsDrawer({
  row,
  onClose,
}: {
  row: AdminCrmRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [customDate, setCustomDate] = useState("");
  const [linkResult, setLinkResult] = useState<{ actionLink: string; email: string } | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin", "crm"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const kikoMut = useMutation({
    mutationFn: (until: string | null) =>
      setKikoBlock({ data: { userId: row!.userId, until } }),
    onSuccess: (_r, until) => {
      toast.success(until ? "Kiko pausado" : "Kiko reactivado");
      invalidateAll();
    },
    onError: (e) => showError(e),
  });

  const trialMut = useMutation({
    mutationFn: (days: number | null) => grantTrial({ data: { userId: row!.userId, days } }),
    onSuccess: (r) => {
      toast.success(r.premiumUntil ? `Trial hasta ${fmtDate(r.premiumUntil)}` : "Trial revocado");
      invalidateAll();
    },
    onError: (e) => showError(e),
  });

  const [pendingRole, setPendingRole] = useState<"user" | "admin" | "dev" | null>(null);
  const roleMut = useMutation({
    mutationFn: (role: "user" | "admin" | "dev") =>
      setUserRole({ data: { userId: row!.userId, role } }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      setPendingRole(null);
      invalidateAll();
    },
    onError: (e) => {
      setPendingRole(null);
      showError(e);
    },
  });

  const impersonateMut = useMutation({
    mutationFn: () => generateImpersonationLink({ data: { userId: row!.userId } }),
    onSuccess: (r) => {
      setLinkResult(r);
      toast.success("Enlace generado. Cópialo con cuidado.");
    },
    onError: (e) => showError(e),
  });

  const open = row !== null;
  const isBlocked =
    !!row?.kikoBlockedUntil && new Date(row.kikoBlockedUntil) > new Date();

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setLinkResult(null);
          setCustomDate("");
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md"
      >
        {row && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-zinc-100">Acciones sobre @{row.username ?? "usuario"}</SheetTitle>
              <div className="mt-2 flex items-center gap-3">
                <span className="grid h-12 w-12 overflow-hidden rounded-full bg-zinc-800 text-sm">
                  {row.avatarUrl ? (
                    <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-zinc-400">
                      {(row.username ?? row.email ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="truncate text-zinc-200">{row.email ?? "sin email"}</p>
                  <p className="truncate text-xs text-zinc-500">{row.userId}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <Section title="Acceso a Kiko" icon={Ban}>
                <p className="text-xs text-zinc-500">
                  Estado actual: {isBlocked ? `bloqueado hasta ${fmtDate(row.kikoBlockedUntil)}` : "activo"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => kikoMut.mutate(daysFromNow(1))} disabled={kikoMut.isPending}>
                    24 horas
                  </ActionButton>
                  <ActionButton onClick={() => kikoMut.mutate(daysFromNow(7))} disabled={kikoMut.isPending}>
                    7 días
                  </ActionButton>
                  {isBlocked && (
                    <ActionButton
                      variant="ghost"
                      onClick={() => kikoMut.mutate(null)}
                      disabled={kikoMut.isPending}
                    >
                      Desbloquear
                    </ActionButton>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-primary focus:outline-none"
                  />
                  <ActionButton
                    variant="danger"
                    disabled={!customDate || kikoMut.isPending}
                    onClick={() => {
                      const iso = new Date(customDate).toISOString();
                      kikoMut.mutate(iso);
                    }}
                  >
                    <Clock className="mr-1 inline h-3 w-3" />
                    Bloquear
                  </ActionButton>
                </div>
              </Section>

              <Section title="Suscripción Melik+" icon={Crown}>
                <p className="text-xs text-zinc-500">
                  {row.isPremium
                    ? "Suscripción Melik+ activa"
                    : row.premiumUntil && new Date(row.premiumUntil) > new Date()
                      ? `Trial hasta ${fmtDate(row.premiumUntil)}`
                      : "Sin trial ni suscripción"}
                </p>
                <p className="text-xs text-zinc-400">
                  Meses pagados totales:{" "}
                  <span className="font-semibold text-zinc-200">{row.paidMonthsTotal}</span>{" "}
                  · Desbloqueos ganados:{" "}
                  <span className="font-semibold text-zinc-200">
                    {row.paidMonthsTotal >= 1 ? Math.floor((row.paidMonthsTotal - 1) / 6) + 1 : 0}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => trialMut.mutate(3)} disabled={trialMut.isPending}>
                    +3 días
                  </ActionButton>
                  <ActionButton onClick={() => trialMut.mutate(7)} disabled={trialMut.isPending}>
                    +1 semana
                  </ActionButton>
                  <ActionButton onClick={() => trialMut.mutate(30)} disabled={trialMut.isPending}>
                    +1 mes
                  </ActionButton>
                  {row.premiumUntil && (
                    <ActionButton
                      variant="ghost"
                      onClick={() => trialMut.mutate(null)}
                      disabled={trialMut.isPending}
                    >
                      Revocar
                    </ActionButton>
                  )}
                </div>
              </Section>

              <Section title="Rol" icon={UserCog}>
                <p className="text-xs text-zinc-500">
                  Rol actual: <span className="font-semibold text-zinc-200">{row.role}</span>
                </p>
                <p className="text-[11px] text-zinc-500">
                  <strong className="text-zinc-300">admin</strong>: acceso al panel /admin.{" "}
                  <strong className="text-zinc-300">dev</strong>: sin acceso a /admin; solo puede
                  otorgarse Melik+ y pruebas gratis desde su propio perfil.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["user", "admin", "dev"] as const).map((r) => {
                    const active = row.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={active || roleMut.isPending}
                        onClick={() => setPendingRole(r)}
                        className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                          active
                            ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                            : r === "admin"
                              ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                              : r === "dev"
                                ? "bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                                : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {r === "admin" ? (
                          <><Shield className="mr-1 inline h-3 w-3" />admin</>
                        ) : r === "dev" ? (
                          <>dev</>
                        ) : (
                          <>user</>
                        )}
                      </button>
                    );
                  })}
                </div>
                {pendingRole && (
                  <div className="mt-2 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs text-amber-200">
                      Confirmar cambio de rol: <strong>{row.role}</strong> →{" "}
                      <strong>{pendingRole}</strong>
                    </p>
                    <div className="flex gap-2">
                      <ActionButton
                        variant="danger"
                        onClick={() => roleMut.mutate(pendingRole)}
                        disabled={roleMut.isPending}
                      >
                        Confirmar
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => setPendingRole(null)}
                        disabled={roleMut.isPending}
                      >
                        Cancelar
                      </ActionButton>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Impersonación" icon={ExternalLink}>
                <p className="text-xs text-zinc-500">
                  Genera un enlace mágico de un solo uso para entrar como este usuario.
                </p>
                <ActionButton
                  variant="danger"
                  onClick={() => impersonateMut.mutate(undefined)}
                  disabled={impersonateMut.isPending}
                >
                  Generar enlace mágico
                </ActionButton>
                {linkResult && (
                  <div className="mt-2 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-[11px] text-zinc-500">Para: {linkResult.email}</p>
                    <textarea
                      readOnly
                      value={linkResult.actionLink}
                      className="h-20 w-full resize-none rounded-lg bg-zinc-900 p-2 font-mono text-[11px] text-zinc-200 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <ActionButton
                        onClick={() => {
                          void navigator.clipboard.writeText(linkResult.actionLink);
                          toast.success("Enlace copiado");
                        }}
                      >
                        <Copy className="mr-1 inline h-3 w-3" />
                        Copiar
                      </ActionButton>
                      <a
                        href={linkResult.actionLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                      >
                        Abrir en pestaña nueva
                      </a>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
