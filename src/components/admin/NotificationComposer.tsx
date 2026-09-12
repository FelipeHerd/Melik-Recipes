import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, Send, ShieldCheck, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { searchAdminUsersV2, type AdminCrmRow } from "@/lib/admin-crm.functions";
import {
  listNotificationTemplates,
  resolveNotificationTargets,
  sendAdminNotification,
  type SendNotificationResult,
} from "@/lib/admin-notifications.functions";

type TargetMode = "users" | "segment" | "uuids";
type Segment =
  | "all"
  | "melik_plus_active"
  | "free"
  | "trial_active"
  | "kiko_blocked"
  | "admins_devs";

const SEGMENT_LABELS: Record<Segment, string> = {
  all: "Todos los usuarios",
  melik_plus_active: "Melik+ activos",
  free: "Cuentas gratuitas",
  trial_active: "En prueba (trial)",
  kiko_blocked: "Kiko bloqueado",
  admins_devs: "Admins y devs",
};

type PickedUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  avatarUrl: string | null;
};

export function NotificationComposer() {
  const queryClient = useQueryClient();

  // ---------- Targets ----------
  const [mode, setMode] = useState<TargetMode>("users");
  const [picked, setPicked] = useState<PickedUser[]>([]);
  const [segment, setSegment] = useState<Segment>("melik_plus_active");
  const [uuidsText, setUuidsText] = useState("");

  const [searchQ, setSearchQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const search = useQuery({
    queryKey: ["admin", "notif-search", searchQ],
    queryFn: () => searchAdminUsersV2({ data: { q: searchQ } }),
    enabled: searchQ.length > 0 && mode === "users",
    staleTime: 15_000,
  });

  function togglePick(u: AdminCrmRow) {
    setPicked((prev) => {
      if (prev.some((p) => p.id === u.userId)) return prev.filter((p) => p.id !== u.userId);
      return [
        ...prev,
        {
          id: u.userId,
          username: u.username,
          firstName: u.firstName,
          avatarUrl: u.avatarUrl,
        },
      ];
    });
  }

  // ---------- Templates ----------
  const templates = useQuery({
    queryKey: ["admin", "notif-templates"],
    queryFn: () => listNotificationTemplates(),
    staleTime: 5 * 60 * 1000,
  });

  const [templateId, setTemplateId] = useState<string>("custom");
  const template = useMemo(
    () => templates.data?.find((t) => t.id === templateId),
    [templates.data, templateId],
  );

  const [customTitle, setCustomTitle] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [customType, setCustomType] = useState<"system" | "kiko" | "melik_plus" | "admin">(
    "system",
  );
  const [ctx, setCtx] = useState<Record<string, string>>({});

  useEffect(() => {
    // Reset ctx when template changes.
    setCtx({});
  }, [templateId]);

  // ---------- Resolve (freeze recipients before sending) ----------
  const [frozen, setFrozen] = useState<{
    userIds: string[];
    count: number;
    invalid: string[];
    sample: PickedUser[];
    overLimit: boolean;
  } | null>(null);

  const resolveMut = useMutation({
    mutationFn: async () => {
      if (mode === "users") {
        if (picked.length === 0) throw new Error("Selecciona al menos un usuario.");
        return resolveNotificationTargets({
          data: { mode: "users", userIds: picked.map((p) => p.id) },
        });
      }
      if (mode === "segment") {
        return resolveNotificationTargets({ data: { mode: "segment", segment } });
      }
      return resolveNotificationTargets({ data: { mode: "uuids", uuidsText } });
    },
    onSuccess: (res) => {
      setFrozen({
        userIds: res.userIds,
        count: res.count,
        invalid: res.invalid,
        sample: res.sample.map((s) => ({
          id: s.id,
          username: s.username,
          firstName: s.firstName,
          avatarUrl: s.avatarUrl,
        })),
        overLimit: res.overLimit,
      });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver destinatarios.");
    },
  });

  // ---------- Confirmation ----------
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const isBroadcast = (frozen?.count ?? 0) > 50;

  // ---------- Send ----------
  const [lastResult, setLastResult] = useState<SendNotificationResult | null>(null);

  const sendMut = useMutation({
    mutationFn: async (retryBatchId?: string) => {
      if (!frozen) throw new Error("Primero resuelve destinatarios.");
      if (!password) throw new Error("Ingresa tu contraseña de admin.");
      const payload =
        templateId === "custom"
          ? {
              userIds: frozen.userIds,
              templateId: "custom" as const,
              customTitle,
              customMessage,
              customType,
              password,
              retryBatchId,
            }
          : {
              userIds: frozen.userIds,
              templateId: templateId as Exclude<typeof templateId, "custom">,
              ctx,
              password,
              retryBatchId,
            };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sendAdminNotification({ data: payload as any });
    },
    onSuccess: (res) => {
      setLastResult(res);
      setPassword("");
      setConfirmText("");
      if (res.status === "ok")
        toast.success(`Enviadas ${res.inserted} notificaciones.`);
      else if (res.status === "partial")
        toast.warning(
          `Envío parcial: ${res.inserted} OK, ${res.failed.length} fallaron.`,
        );
      else toast.error("El envío falló completamente. Revisa el detalle.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "notif-history"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
    },
  });

  // ---------- Validation gates ----------
  function contentReady(): string | null {
    if (templateId === "custom") {
      if (customTitle.trim().length < 3) return "Título muy corto.";
      if (customMessage.trim().length < 3) return "Mensaje muy corto.";
    } else if (template) {
      for (const key of template.requiredContext) {
        if (!ctx[key] || ctx[key]!.trim() === "")
          return `Falta valor para {ctx.${key}}.`;
      }
    }
    return null;
  }

  const contentError = contentReady();
  const targetsReady =
    mode === "users"
      ? picked.length > 0
      : mode === "segment"
        ? true
        : uuidsText.trim().length > 0;

  // ---------- Preview render (client-side; server re-renders authoritatively) ----------
  const previewSample = picked[0] ?? frozen?.sample[0];
  const previewNombre =
    previewSample?.firstName?.trim() || previewSample?.username?.trim() || "hola";
  function renderPreview(text: string): string {
    return text
      .replace(/\{nombre\}/g, previewNombre)
      .replace(/\{ctx\.([a-z0-9_]+)\}/gi, (_f, k: string) => ctx[k] || `{ctx.${k}}`);
  }
  const previewTitle =
    templateId === "custom" ? customTitle : (template?.title ?? "");
  const previewMessage =
    templateId === "custom" ? customMessage : (template?.message ?? "");

  // Reset frozen when the user changes anything material.
  const resetFrozenRef = useRef<() => void>(() => setFrozen(null));
  resetFrozenRef.current = () => {
    setFrozen(null);
    setLastResult(null);
  };
  useEffect(() => {
    resetFrozenRef.current();
  }, [mode, segment, uuidsText, picked, templateId, customTitle, customMessage, customType, ctx]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* -------- LEFT: Composer -------- */}
      <div className="flex flex-col gap-6">
        {/* Targets */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-zinc-100">Destinatarios</h2>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(["users", "segment", "uuids"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {m === "users" ? "Buscar usuarios" : m === "segment" ? "Segmento" : "UUIDs"}
              </button>
            ))}
          </div>

          {mode === "users" && (
            <div className="flex flex-col gap-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar por email, @username o UUID…"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-primary focus:outline-none"
                />
              </label>

              {search.isFetching && (
                <p className="text-xs text-zinc-500">Buscando…</p>
              )}
              {search.data && search.data.length > 0 && (
                <ul className="max-h-56 divide-y divide-zinc-800 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
                  {search.data.map((u) => {
                    const active = picked.some((p) => p.id === u.userId);
                    return (
                      <li key={u.userId}>
                        <button
                          type="button"
                          onClick={() => togglePick(u)}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                            active ? "bg-primary/15" : "hover:bg-zinc-800"
                          }`}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-800 text-xs">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (u.firstName?.[0] ?? u.username?.[0] ?? "?").toUpperCase()
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <p className="truncate text-zinc-100">
                              {u.firstName ?? u.username ?? u.email ?? u.userId}
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {u.username ? `@${u.username}` : ""} {u.email ? `· ${u.email}` : ""}
                            </p>
                          </span>
                          {active && <ShieldCheck className="h-4 w-4 text-primary" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {picked.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {picked.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-100"
                    >
                      {p.firstName ?? p.username ?? p.id.slice(0, 8)}
                      <button
                        type="button"
                        onClick={() =>
                          setPicked((prev) => prev.filter((x) => x.id !== p.id))
                        }
                        className="text-zinc-500 hover:text-zinc-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-100"
                  >
                    <Trash2 className="h-3 w-3" /> Limpiar
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "segment" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSegment(s)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                    segment === s
                      ? "border-primary bg-primary/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {SEGMENT_LABELS[s]}
                </button>
              ))}
              <p className="col-span-full mt-1 text-xs text-zinc-500">
                Los segmentos "Todos" y "Admins y devs" requieren rol admin. Los
                admins/devs se excluyen automáticamente de los demás.
              </p>
            </div>
          )}

          {mode === "uuids" && (
            <div>
              <textarea
                value={uuidsText}
                onChange={(e) => setUuidsText(e.target.value)}
                rows={5}
                placeholder="Pega UUIDs separados por espacio, coma o salto de línea…"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Máximo 2.000 UUIDs. Los inválidos y admins/devs se descartan.
              </p>
            </div>
          )}
        </section>

        {/* Template + content */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-zinc-100">Contenido</h2>
          </div>

          <label className="block text-xs uppercase tracking-widest text-zinc-500">
            Plantilla
          </label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 focus:border-primary focus:outline-none"
          >
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.isAuto ? " · (también automática)" : ""}
              </option>
            ))}
          </select>
          {template?.description && (
            <p className="mt-2 text-xs text-zinc-500">{template.description}</p>
          )}

          {templateId === "custom" ? (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500">
                  Tipo
                </label>
                <select
                  value={customType}
                  onChange={(e) =>
                    setCustomType(e.target.value as "system" | "kiko" | "melik_plus" | "admin")
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 focus:border-primary focus:outline-none"
                >
                  <option value="system">system</option>
                  <option value="melik_plus">melik_plus</option>
                  <option value="kiko">kiko</option>
                  <option value="admin">admin</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Los tipos <code>admin</code> y <code>system</code> son solo para rol admin.
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500">
                  Título ({customTitle.length}/120)
                </label>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value.slice(0, 120))}
                  placeholder="Ej. Hola {nombre}, tenemos novedades"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500">
                  Mensaje ({customMessage.length}/500)
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value.slice(0, 500))}
                  rows={5}
                  placeholder="Puedes usar {nombre}. Enlaces solo al dominio de la app o melikbakery.com."
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          ) : (
            template && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
                  <p className="font-medium text-zinc-200">{template.title}</p>
                  <p className="mt-1">{template.message}</p>
                </div>
                {template.requiredContext.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {template.requiredContext.map((k) => (
                      <div key={k}>
                        <label className="block text-xs uppercase tracking-widest text-zinc-500">
                          {`{ctx.${k}}`}
                        </label>
                        <input
                          value={ctx[k] ?? ""}
                          onChange={(e) =>
                            setCtx((prev) => ({ ...prev, [k]: e.target.value.slice(0, 200) }))
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-primary focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {contentError && (
            <p className="mt-3 text-xs text-amber-400">{contentError}</p>
          )}
        </section>
      </div>

      {/* -------- RIGHT: Preview + confirm -------- */}
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">Vista previa</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Aproximada. El servidor re-renderiza por destinatario.
          </p>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <p className="font-medium text-foreground">
              {renderPreview(previewTitle) || (
                <span className="text-zinc-500">Sin título</span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {renderPreview(previewMessage) || (
                <span className="text-zinc-500">Sin mensaje</span>
              )}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">Confirmar y enviar</h2>

          {!frozen ? (
            <>
              <p className="mt-2 text-xs text-zinc-500">
                Primero congela la lista de destinatarios para revisar el conteo.
              </p>
              <button
                type="button"
                disabled={!targetsReady || !!contentError || resolveMut.isPending}
                onClick={() => resolveMut.mutate()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resolveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Resolver destinatarios
              </button>
            </>
          ) : (
            <>
              <div className="mt-2 space-y-2 text-sm">
                <p className="text-zinc-100">
                  <span className="text-2xl font-semibold">{frozen.count}</span>{" "}
                  <span className="text-zinc-500">destinatarios</span>
                </p>
                {frozen.overLimit && (
                  <p className="rounded-lg border border-red-900/40 bg-red-950/30 p-2 text-xs text-red-300">
                    Excede el cap de 2.000. Reduce la lista.
                  </p>
                )}
                {frozen.invalid.length > 0 && (
                  <p className="text-xs text-amber-400">
                    Se descartaron {frozen.invalid.length} entradas (inválidas o
                    admins/devs).
                  </p>
                )}
                {frozen.sample.length > 0 && (
                  <div className="flex -space-x-2">
                    {frozen.sample.map((s) => (
                      <span
                        key={s.id}
                        title={s.username ?? s.id}
                        className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 border-zinc-950 bg-zinc-800 text-[10px]"
                      >
                        {s.avatarUrl ? (
                          <img src={s.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (s.firstName?.[0] ?? s.username?.[0] ?? "?").toUpperCase()
                        )}
                      </span>
                    ))}
                    {frozen.count > frozen.sample.length && (
                      <span className="grid h-8 min-w-8 place-items-center rounded-full border-2 border-zinc-950 bg-zinc-800 px-2 text-[10px] text-zinc-400">
                        +{frozen.count - frozen.sample.length}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isBroadcast && (
                <div className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="font-medium">Envío masivo</p>
                  </div>
                  <p>
                    Escribe <code className="text-amber-200">ENVIAR {frozen.count}</code>{" "}
                    para desbloquear el botón.
                  </p>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-amber-900/40 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              <div className="mt-3">
                <label className="block text-xs uppercase tracking-widest text-zinc-500">
                  Confirma tu contraseña de admin
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Requerida para todo envío. Se verifica en el servidor.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFrozen(null)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={
                    sendMut.isPending ||
                    frozen.overLimit ||
                    (isBroadcast && confirmText !== `ENVIAR ${frozen.count}`) ||
                    password.length === 0
                  }
                  onClick={() => sendMut.mutate(undefined)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sendMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar
                </button>
              </div>

              {lastResult && (
                <div className="mt-4 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
                  <p className="text-zinc-300">
                    <span className="font-medium">Batch:</span>{" "}
                    <code className="text-zinc-400">{lastResult.batchId.slice(0, 8)}</code>
                    {" · "}
                    <span className="text-emerald-400">{lastResult.inserted} OK</span>
                    {lastResult.failed.length > 0 && (
                      <>
                        {" · "}
                        <span className="text-red-400">{lastResult.failed.length} fallaron</span>
                      </>
                    )}
                  </p>
                  {lastResult.failed.length > 0 && (
                    <button
                      type="button"
                      onClick={() => sendMut.mutate(lastResult.batchId)}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 hover:bg-zinc-800"
                    >
                      Reintentar fallos
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
