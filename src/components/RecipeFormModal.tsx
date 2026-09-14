import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Upload, ImagePlus, Loader2, Calculator, Lock } from "lucide-react";
import { toast } from "sonner";
import { showError, errorText } from "@/lib/errors/toast";
import type { Recipe, NewRecipe } from "@/lib/recipes-context";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { emojiFor, STANDARD_CATEGORIES } from "@/lib/categories";
import { UNIT_OPTIONS, MAX_ROWS, type Ingredient, type Step } from "@/lib/recipe-format";
import { uploadRecipeImage } from "@/lib/recipes.functions";
import { isBakingCategory, sumPercents, formatScaledQty } from "@/lib/baker-calc";
import { ImagePickerButton } from "@/components/ImagePickerButton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProfile } from "@/lib/use-profile";
import { persistDraft } from "@/lib/drafts";

type StepDraft = Step & { uploading?: boolean };

function emptyIngredient(): Ingredient {
  return { quantity: "", unit: "", name: "" };
}
function emptyStep(): StepDraft {
  return { text: "", imagePath: null, imageUrl: null };
}

const AUTOSAVE_MS = 1500;

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RecipeFormModal({
  initial,
  isAuthenticated,
  onClose,
  onSave,
  adminMode = false,
}: {
  initial?: Recipe;
  isAuthenticated: boolean;
  onClose: () => void;
  /** Called on explicit submit. `meta.draftId` is the row id when the modal
   *  auto-created a draft (or when editing an existing draft). Parent should
   *  update-and-publish that id instead of creating a fresh row. */
  onSave: (r: NewRecipe, meta: { draftId: string | null }) => Promise<void> | void;
  /** Admin catalog mode: unlocks the "Exigir Melik+" switch and disables the
   *  paywall lock on the "public" switch (admins publish official recipes). */
  adminMode?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [time, setTime] = useState<string>(initial ? String(initial.timeMinutes || 1) : "30");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial && initial.ingredients.length > 0
      ? [...initial.ingredients, emptyIngredient()]
      : [emptyIngredient()],
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    initial && initial.instructions.length > 0
      ? [...initial.instructions.map((s) => ({ ...s })), emptyStep()]
      : [emptyStep()],
  );
  const originalStepPaths = useMemo(
    () =>
      new Set((initial?.instructions ?? []).map((s) => s.imagePath).filter(Boolean) as string[]),
    [initial],
  );

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial?.imageUrl ?? null);
  const [coverCleared, setCoverCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean>(initial?.isPublic ?? true);
  const categoryIsBaking = isBakingCategory(category);
  const initialHasPercent = useMemo(
    () => initial?.ingredients.some((i) => (i.unit ?? "").trim() === "%") ?? false,
    [initial],
  );
  const initialIsBaking = isBakingCategory(initial?.category);
  const [bakerMode, setBakerMode] = useState<boolean>(
    () =>
      initialIsBaking &&
      (initial?.isBakerMode === true || (initial?.isBakerMode === undefined && initialHasPercent)),
  );
  // Admin-only: control the Melik+ paywall flag when curating official recipes.
  const [isPremiumOnly, setIsPremiumOnly] = useState<boolean>(initial?.isPremiumOnly ?? false);

  // ---- Community publish switch (paywall-aware, tri-state) ----
  const { isPremium, profile } = useProfile();
  const myUsername = profile?.username ?? null;
  const isClonedFromOther = !!(initial?.originalAuthor && initial.originalAuthor !== myUsername);
  // In admin mode the switch is fully unlocked (no paywall + no attribution
  // lock — admin recipes have no "original author from community").
  const lockedByAttribution = !adminMode && isClonedFromOther;
  const lockedByPaywall = !adminMode && !isPremium && !isClonedFromOther;
  const switchDisabled = lockedByAttribution || lockedByPaywall;
  const effectiveChecked = lockedByAttribution ? false : lockedByPaywall ? true : isPublic;
  const tooltipMessage = lockedByAttribution
    ? "Esta receta pertenece a la comunidad y no puede ser republicada por ti."
    : lockedByPaywall
      ? "Solo los miembros Melik+ tienen el beneficio de crear recetas privadas y privatizar sus contenidos."
      : null;

  useEffect(() => {
    if (!categoryIsBaking && bakerMode) setBakerMode(false);
  }, [categoryIsBaking, bakerMode]);
  const bakerFormMode = categoryIsBaking && bakerMode;

  useModalA11y(onClose);

  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  // ---- Autosave state ----
  // draftId: id of the persisted draft row.
  //   - If editing an existing recipe (draft or not) → keep initial.id for a-nautosave-target when it's a draft.
  //   - We ONLY autosave when authenticated AND (no initial OR initial.isDraft).
  //     Autosaving over a published recipe would silently mutate it.
  const queryClient = useQueryClient();
  const canAutosave = isAuthenticated && (!initial || initial.isDraft);
  const [draftId, setDraftId] = useState<string | null>(
    initial && initial.isDraft ? initial.id : null,
  );
  const [autoStatus, setAutoStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; at: Date }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });
  const inflightRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<string | null>(draftId);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  // Autosave trigger — debounce edits to form fields.
  const runAutosaveRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!canAutosave) return;
    if (!title.trim()) return; // don't create a draft with no title
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void runAutosave();
    }, AUTOSAVE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, category, time, ingredients, steps, bakerFormMode, canAutosave]);

  // Flush pending autosave on unmount (e.g. user closes the modal before the
  // debounce fires) so the draft appears in the list immediately.
  useEffect(() => {
    runAutosaveRef.current = () => {
      void runAutosave();
    };
  });
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        runAutosaveRef.current();
      }
    };
  }, []);

  async function runAutosave() {
    if (!canAutosave) return;
    if (!title.trim()) return;
    if (inflightRef.current) {
      pendingRef.current = true;
      return;
    }
    inflightRef.current = true;
    setAutoStatus({ kind: "saving" });
    try {
      const cleanIngredients = ingredients
        .filter((i) => i.name || i.quantity || i.unit)
        .map((i) => (bakerFormMode ? { ...i, unit: "%" } : i));
      const cleanSteps = steps
        .filter((s) => s.text || s.imagePath)
        .map((s) => ({ text: s.text, imagePath: s.imagePath ?? null }));
      const cat = category.trim() || "Otro";
      const id = await persistDraft({
        id: draftIdRef.current,
        title: title.trim(),
        category: cat,
        timeMinutes: Math.max(1, parseInt(time, 10) || 1),
        emoji: emojiFor(cat),
        ingredients: cleanIngredients,
        instructions: cleanSteps,
        imagePath: coverCleared ? null : (initial?.imagePath ?? null),
        isBakerMode: bakerFormMode,
      });
      // Only replace the id on first successful save (INSERT). Later saves keep same id.
      if (draftIdRef.current !== id) {
        draftIdRef.current = id;
        setDraftId(id);
        // Instantly reflect the new draft in the sidebar/list.
        queryClient.invalidateQueries({ queryKey: ["drafts"] });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      }
      setAutoStatus({ kind: "saved", at: new Date() });
    } catch (err) {
      setAutoStatus({
        kind: "error",
        msg: errorText(err, "APP-RCP-004"),
      });
    } finally {
      inflightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runAutosave();
      }
    }
  }

  const onCoverFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      showError(new Error("APP-FILE-001: cover mime"));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      showError(new Error("APP-FILE-002: cover >5MB"));
      return;
    }
    setCoverFile(f);
    setCoverCleared(false);
  };

  const clearCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverCleared(true);
  };

  const updateIngredient = (idx: number, patch: Partial<Ingredient>) => {
    setIngredients((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));
      const last = next[next.length - 1];
      if ((last?.name || last?.quantity || last?.unit) && next.length < MAX_ROWS) {
        next.push(emptyIngredient());
      }
      return next;
    });
  };
  const removeIngredient = (idx: number) => {
    setIngredients((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [emptyIngredient()] : next;
    });
  };

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));
      const last = next[next.length - 1];
      if ((last?.text || last?.imagePath) && next.length < MAX_ROWS) {
        next.push(emptyStep());
      }
      return next;
    });
  };
  const removeStep = (idx: number) => {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [emptyStep()] : next;
    });
  };

  const onStepImage = async (idx: number, file: File | null) => {
    if (!file) return;
    if (!isAuthenticated) {
      toast.error("Inicia sesión para añadir fotos a cada paso");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showError(new Error("APP-FILE-001: step mime"));
      return;
    }
    updateStep(idx, { uploading: true });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploaded = await uploadRecipeImage({ data: fd });
      updateStep(idx, { imagePath: uploaded.path, imageUrl: uploaded.signedUrl, uploading: false });
    } catch (err) {
      updateStep(idx, { uploading: false });
      showError(err);
    }
  };

  const clearStepImage = (idx: number) => {
    updateStep(idx, { imagePath: null, imageUrl: null });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    const cat = category.trim();
    if (!cat) {
      toast.error("Escribe o elige una categoría");
      return;
    }

    // Cancel any pending autosave and wait for in-flight to finish so we
    // don't race an INSERT after publish (would leave a stray draft row).
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cleanIngredients = ingredients
      .filter((i) => i.name || i.quantity || i.unit)
      .map((i) => (bakerFormMode ? { ...i, unit: "%" } : i));
    const cleanSteps = steps
      .filter((s) => s.text || s.imagePath)
      .map<Step>((s) => ({ text: s.text, imagePath: s.imagePath ?? null }));

    const keptPaths = new Set(cleanSteps.map((s) => s.imagePath).filter(Boolean) as string[]);
    const removedImagePaths: string[] = [];
    for (const p of originalStepPaths) if (!keptPaths.has(p)) removedImagePaths.push(p);
    if (initial?.imagePath && (coverCleared || coverFile) && !keptPaths.has(initial.imagePath)) {
      if (coverCleared || coverFile) removedImagePaths.push(initial.imagePath);
    }

    setSaving(true);
    try {
      const payload: NewRecipe = {
        title: title.trim(),
        category: cat,
        timeMinutes: Math.max(1, parseInt(time, 10) || 1),
        ingredients: cleanIngredients,
        instructions: cleanSteps,
        emoji: emojiFor(cat),
        imageFile: coverFile,
        removedImagePaths,
        isBakerMode: bakerFormMode,
        // Vacuna #1 mirror: server re-enforces this. Cloned recipes are always private.
        isPublic: lockedByAttribution ? false : effectiveChecked,
        ...(adminMode ? { isOfficialMelik: true, isPremiumOnly } : {}),
      };
      if (initial) {
        payload.imagePath = coverCleared
          ? null
          : coverFile
            ? undefined
            : (initial.imagePath ?? null);
      } else if (draftIdRef.current) {
        // Draft autosaved a cover already; preserve it unless user changed it.
        payload.imagePath = coverCleared ? null : coverFile ? undefined : undefined;
      }
      await onSave(payload, { draftId: draftIdRef.current });
    } finally {
      setSaving(false);
    }
  };

  const statusText = (() => {
    if (!canAutosave) return null;
    if (autoStatus.kind === "saving") return "Guardando…";
    if (autoStatus.kind === "saved") return `Borrador guardado a las ${formatTime(autoStatus.at)}`;
    if (autoStatus.kind === "error") return `Error: ${autoStatus.msg}`;
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-form-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl animate-enter sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6 sm:px-8">
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl text-foreground/60 hover:bg-card hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id="recipe-form-title" className="font-display text-2xl font-semibold sm:text-3xl">
            {initial && !initial.isDraft
              ? "Editar receta"
              : initial?.isDraft
                ? "Continuar borrador"
                : "Añadir receta"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {initial && !initial.isDraft
              ? "Actualiza los detalles y guarda los cambios."
              : "Escribe o pega los datos. También puedes adjuntar una foto."}
          </p>
          {statusText && (
            <p
              className={
                "mt-1 text-xs " +
                (autoStatus.kind === "error" ? "text-destructive" : "text-muted-foreground/80")
              }
              aria-live="polite"
            >
              {statusText}
            </p>
          )}
        </div>

        <form className="flex-1 overflow-y-auto px-6 py-6 sm:px-8" onSubmit={submit}>
          <div className="grid gap-4">
            <Field label="Título">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ej. Tortilla de patatas"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoría">
                <input
                  list="melik-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  placeholder="Elige o escribe una categoría"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="melik-categories">
                  {STANDARD_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>

              <Field label="Tiempo (min)">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={1}
                  step={1}
                  value={time}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) setTime(v);
                  }}
                  onBlur={() => {
                    if (time === "" || time === "0") setTime("1");
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            </div>

            {categoryIsBaking && (
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/20 p-3">
                <label
                  htmlFor="form-baker-mode"
                  className="flex cursor-pointer items-center gap-2 text-sm font-semibold"
                >
                  <Calculator className="h-4 w-4 text-primary" />
                  ¿Usar Porcentaje Panadero?
                </label>
                <Switch id="form-baker-mode" checked={bakerMode} onCheckedChange={setBakerMode} />
              </div>
            )}

            {/* Community publish switch — always rendered so the layout stays stable. */}
            {isAuthenticated && (
              <TooltipProvider delayDuration={150}>
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-medium">Hacer receta pública en la comunidad</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Otros usuarios podrán descubrirla y guardarla en su recetario.
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-none items-center gap-2">
                        {switchDisabled && (
                          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        )}
                        <Switch
                          checked={effectiveChecked}
                          disabled={switchDisabled}
                          onCheckedChange={setIsPublic}
                          aria-label="Hacer receta pública"
                        />
                      </div>
                    </TooltipTrigger>
                    {tooltipMessage && (
                      <TooltipContent side="left" className="max-w-[220px] text-xs">
                        {tooltipMessage}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}

            {/* Admin-only: paywall flag for the Melik+ vault. */}
            {adminMode && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    Exigir Melik+
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Solo miembros Melik+ podrán ver los ingredientes y pasos.
                  </p>
                </div>
                <Switch
                  checked={isPremiumOnly}
                  onCheckedChange={setIsPremiumOnly}
                  aria-label="Exigir Melik+"
                />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {bakerFormMode ? "Ingredientes (fórmula panadera)" : "Ingredientes"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {ingredients.length}/{MAX_ROWS}
                </span>
              </div>
              {bakerFormMode && (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Ingresa cada ingrediente como porcentaje. No es necesario que sumen 100 %.
                </p>
              )}
              <div className="space-y-2">
                {ingredients.map((ing, i) => (
                  <IngredientRow
                    key={i}
                    value={ing}
                    bakerMode={bakerFormMode}
                    onChange={(patch) => updateIngredient(i, patch)}
                    onRemove={() => removeIngredient(i)}
                  />
                ))}
              </div>
              {bakerFormMode && (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  Total de fórmula:{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatScaledQty(sumPercents(ingredients))}%
                  </strong>
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pasos
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {steps.length}/{MAX_ROWS}
                </span>
              </div>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <StepRow
                    key={i}
                    index={i}
                    value={s}
                    isAuthenticated={isAuthenticated}
                    onChange={(patch) => updateStep(i, patch)}
                    onRemove={() => removeStep(i)}
                    onImage={(file) => onStepImage(i, file)}
                    onClearImage={() => clearStepImage(i)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <ImagePickerButton
                onFile={onCoverFile}
                ariaLabel="Añadir foto de portada"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-sm hover:bg-card"
              >
                <span className="inline-flex items-center gap-2 text-foreground/80">
                  <Upload className="h-4 w-4" />{" "}
                  {coverFile ? coverFile.name : "Foto de portada (opcional, máx. 5 MB)"}
                </span>
                <span className="rounded-lg bg-background px-3 py-1.5 text-xs font-medium">
                  Añadir foto
                </span>
              </ImagePickerButton>
              {coverPreview && (
                <div className="relative overflow-hidden rounded-2xl border border-border">
                  <img
                    src={coverPreview}
                    alt="Vista previa"
                    loading="lazy"
                    decoding="async"
                    className="max-h-56 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearCover}
                    aria-label="Quitar imagen"
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-background/80 text-foreground/70 backdrop-blur hover:bg-background hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl px-5 text-sm font-medium text-foreground/70 hover:bg-card"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving
                ? "Guardando…"
                : initial && !initial.isDraft
                  ? "Guardar cambios"
                  : "Finalizar receta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IngredientRow({
  value,
  bakerMode = false,
  onChange,
  onRemove,
}: {
  value: Ingredient;
  bakerMode?: boolean;
  onChange: (patch: Partial<Ingredient>) => void;
  onRemove: () => void;
}) {
  if (bakerMode) {
    return (
      <div className="rounded-2xl border border-border bg-card p-2">
        <div className="grid gap-2 md:grid-cols-[9rem_1fr_auto] md:items-center">
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={value.quantity}
              onChange={(e) => onChange({ quantity: e.target.value, unit: "%" })}
              placeholder="100"
              aria-label="Porcentaje"
              className="h-10 w-full rounded-lg border border-border bg-background pl-3 pr-8 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground"
            >
              %
            </span>
          </div>
          <div className="flex gap-2 md:contents">
            <input
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Ingrediente (ej. Harina de trigo)"
              aria-label="Nombre del ingrediente"
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Quitar ingrediente"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-background hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <div className="grid gap-2 md:grid-cols-[6rem_8rem_1fr_auto] md:items-center">
        <div className="flex gap-2 md:contents">
          <input
            value={value.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            placeholder="Cant."
            aria-label="Cantidad"
            className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring md:w-full"
          />
          <select
            value={value.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            aria-label="Unidad"
            className="h-10 flex-1 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring md:w-full md:flex-none"
          >
            <option value="">—</option>
            {UNIT_OPTIONS.filter(Boolean).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 md:contents">
          <input
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ingrediente"
            aria-label="Nombre del ingrediente"
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Quitar ingrediente"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-background hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StepRow({
  index,
  value,
  isAuthenticated,
  onChange,
  onRemove,
  onImage,
  onClearImage,
}: {
  index: number;
  value: StepDraft;
  isAuthenticated: boolean;
  onChange: (patch: Partial<StepDraft>) => void;
  onRemove: () => void;
  onImage: (file: File | null) => void;
  onClearImage: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold text-foreground/70 ring-1 ring-border">
          {index + 1}
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={value.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            placeholder="Describe este paso…"
            aria-label={`Texto del paso ${index + 1}`}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            {isAuthenticated ? (
              <ImagePickerButton
                onFile={(f) => onImage(f)}
                disabled={value.uploading}
                ariaLabel={value.imageUrl ? "Cambiar foto del paso" : "Añadir foto al paso"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground/80 hover:bg-card disabled:opacity-60"
              >
                {value.uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                {value.imageUrl ? "Cambiar foto" : "Foto del paso"}
              </ImagePickerButton>
            ) : (
              <button
                type="button"
                onClick={() => toast.info("Inicia sesión para añadir fotos a cada paso")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground/80 opacity-60 hover:bg-card"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Foto del paso
              </button>
            )}
            {!isAuthenticated && (
              <span className="text-[11px] text-muted-foreground">
                Inicia sesión para añadir fotos a cada paso.
              </span>
            )}
            {value.imageUrl && (
              <div className="relative">
                <img
                  src={value.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-12 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={onClearImage}
                  aria-label="Quitar foto del paso"
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-background text-foreground/70 shadow ring-1 ring-border hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar paso ${index + 1}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-background hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
