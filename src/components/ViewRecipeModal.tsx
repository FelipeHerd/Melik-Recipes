import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { BookOpen, Clock, Pencil, Sparkles, X, RefreshCw, Lock, Check, Share2, Plus, Loader2, Calculator } from "lucide-react";
const ShareRecipeModal = lazy(() =>
  import("@/components/ShareRecipeModal").then((m) => ({ default: m.ShareRecipeModal })),
);
import { RecipePaywallOverlay } from "@/components/RecipePaywallOverlay";
import { useProfile } from "@/lib/use-profile";
import { ImageWithSkeleton } from "@/components/ImageWithSkeleton";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { isCustomCategory } from "@/lib/categories";
import type { Ingredient, Step } from "@/lib/recipe-format";
import { Switch } from "@/components/ui/switch";
import {
  clearBakerTotal,
  formatScaledQty,
  gramsFromPercent,
  isBakingCategory,
  loadBakerTotal,
  parsePercent,
  saveBakerTotal,
  totalFromIngredientGrams,
} from "@/lib/baker-calc";

export type ViewableRecipe = {
  id: string;
  title: string;
  category: string;
  emoji: string;
  timeMinutes: number;
  imageUrl?: string | null;
  ingredients: Ingredient[];
  instructions: Step[];
  isBakerMode?: boolean;
  originalAuthor?: string | null;
};

export function ViewRecipeModal({
  recipe,
  onClose,
  onEdit,
  readOnly = false,
  officialBadge = false,
  hideImages = false,
  onSaveToLibrary,
  savingToLibrary = false,
  ownershipNotice,
  isLocked = false,
  currentUsername = null,
  paywall,
}: {
  recipe: ViewableRecipe;
  onClose: () => void;
  onEdit?: () => void;
  readOnly?: boolean;
  officialBadge?: boolean;
  /** Vacuna #2: when true, cover + step images are replaced by emoji placeholders. */
  hideImages?: boolean;
  /** When set, renders a "Guardar en mi recetario" CTA in the footer. */
  onSaveToLibrary?: () => void;
  savingToLibrary?: boolean;
  /** When set, renders a passive ownership label in the footer (e.g. "Eres el propietario…"). */
  ownershipNotice?: string;
  /** When true, the server redacted ingredients + steps — render the paywall overlay. */
  isLocked?: boolean;
  /** When provided, hides "Receta de @{originalAuthor}" if it matches this username (case-insensitive). */
  currentUsername?: string | null;
  /** Extra props threaded into the paywall overlay (unlocks flow). */
  paywall?: {
    isPremium?: boolean;
    unlocksAvailable?: number;
    nextUnlockAtMonth?: number;
    paidMonthsTotal?: number;
    onClaim?: () => void;
    claiming?: boolean;
  };

}) {
  const { isAuthenticated } = useProfile();
  const [checkedIng, setCheckedIng] = useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const canShare = !readOnly && !!onEdit;
  const showCoverImage = !hideImages && !!recipe.imageUrl;

  useModalA11y(onClose);

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSet(next);
  };

  const categoryIsBaking = isBakingCategory(recipe.category);
  const hasPercent = useMemo(
    () => recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%"),
    [recipe.ingredients],
  );
  const defaultBakerMode = useMemo(
    () =>
      categoryIsBaking &&
      (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent)),
    [categoryIsBaking, recipe.isBakerMode, hasPercent],
  );
  const [bakerModeToggle, setBakerModeToggle] = useState<boolean>(defaultBakerMode);

  useEffect(() => {
    setBakerModeToggle(
      isBakingCategory(recipe.category) &&
        (recipe.isBakerMode === true ||
          (recipe.isBakerMode === undefined && recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%"))),
    );
  }, [recipe.id, recipe.category, recipe.isBakerMode, recipe.ingredients]);

  const bakerMode = categoryIsBaking && bakerModeToggle;


  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-recipe-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[color:var(--background)] shadow-2xl animate-enter sm:rounded-3xl"
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[color:var(--ochre)]/30 to-primary/20 px-6 pb-6 pt-10 sm:px-10 sm:pt-10">
          {showCoverImage && (
            <>
              <ImageWithSkeleton
                src={recipe.imageUrl!}
                alt=""
                aria-hidden
                wrapperClassName="absolute inset-0"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/60 to-background/20" />
            </>
          )}
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            {canShare && (
              <button
                onClick={() => setShareOpen(true)}
                aria-label="Compartir receta"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-background/80 px-2.5 text-xs font-medium text-foreground/80 backdrop-blur hover:bg-background hover:text-foreground sm:px-3"
              >
                <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Compartir</span>
              </button>
            )}
            {!readOnly && onEdit && (
              <button
                onClick={onEdit}
                aria-label="Editar receta"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-background/80 px-2.5 text-xs font-medium text-foreground/80 backdrop-blur hover:bg-background hover:text-foreground sm:px-3"
              >
                <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-10 w-10 place-items-center rounded-xl bg-background/70 text-foreground/70 backdrop-blur hover:bg-background hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-14 flex flex-col gap-3 sm:mt-2 sm:flex-row sm:items-center sm:gap-4">
            {!(isCustomCategory(recipe.category) && !showCoverImage) && (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-background/70 text-3xl backdrop-blur sm:h-16 sm:w-16 sm:text-4xl" aria-hidden>
                {recipe.emoji}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--ochre)]">{recipe.category}</p>
                {officialBadge && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Oficial Melik
                  </span>
                )}
                {readOnly && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
                    <Lock className="h-3 w-3" /> Solo lectura
                  </span>
                )}
              </div>
              <h2 id="view-recipe-title" className="font-display text-2xl font-semibold leading-tight line-clamp-2 sm:text-3xl">
                {recipe.title}
              </h2>
              {recipe.originalAuthor &&
                (!currentUsername ||
                  recipe.originalAuthor.toLowerCase() !== currentUsername.toLowerCase()) && (
                <p className="mt-1 text-sm italic text-muted-foreground truncate">
                  Receta de <span className="font-medium not-italic">@{recipe.originalAuthor}</span>
                </p>
              )}
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> {recipe.timeMinutes} min
              </p>
            </div>
          </div>
        </div>



        <div className="relative flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-10">
          {isLocked && (
            <RecipePaywallOverlay
              isAuthenticated={isAuthenticated}
              recipeTitle={recipe.title}
              isPremium={paywall?.isPremium}
              unlocksAvailable={paywall?.unlocksAvailable}
              nextUnlockAtMonth={paywall?.nextUnlockAtMonth}
              paidMonthsTotal={paywall?.paidMonthsTotal}
              onClaim={paywall?.onClaim}
              claiming={paywall?.claiming}
            />
          )}

          <section className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">Ingredientes</h3>
                {categoryIsBaking && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="view-baker-mode-switch"
                      className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Calculator className="h-3.5 w-3.5 text-primary" />
                      Porcentaje Panadero
                    </label>
                    <Switch
                      id="view-baker-mode-switch"
                      checked={bakerModeToggle}
                      onCheckedChange={setBakerModeToggle}
                      aria-label="Modo Porcentaje Panadero"
                    />
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {bakerMode
                  ? "Ajusta el peso total o los gramos de un ingrediente y el resto se recalcula."
                  : "Marca lo que ya tengas listo"}
              </p>

              {recipe.ingredients.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin ingredientes anotados.</p>
              ) : bakerMode ? (
                <BakerCalculator recipe={recipe} />
              ) : (
                <ul className="mt-4 space-y-2">
                  {recipe.ingredients.map((ing, i) => {
                    const checked = checkedIng.has(i);
                    const isPct = (ing.unit ?? "").trim() === "%";
                    const text = isPct
                      ? `${ing.quantity || ""}% ${ing.name}`.trim()
                      : [ing.quantity, ing.unit, ing.name].filter(Boolean).join(" ").trim();
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => toggle(checkedIng, setCheckedIng, i)}
                          className="group flex w-full items-start gap-3 rounded-2xl bg-card px-3 py-2.5 text-left text-sm transition hover:bg-card/70"
                        >
                          <span
                            className={
                              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border " +
                              (checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background")
                            }
                            aria-hidden
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className={checked ? "text-muted-foreground line-through" : ""}>{text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="font-display text-lg font-semibold">Pasos</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Toca cada paso al completarlo</p>
              {recipe.instructions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin instrucciones aún.</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {recipe.instructions.map((step, i) => {
                    const done = doneSteps.has(i);
                    return (
                      <li key={i}>
                        <div className="flex items-stretch gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 transition hover:border-primary/40">
                          <button
                            type="button"
                            onClick={() => toggle(doneSteps, setDoneSteps, i)}
                            className="flex flex-1 items-start gap-3 text-left"
                          >
                            <span
                              className={
                                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold " +
                                (done ? "bg-primary text-primary-foreground" : "bg-background text-foreground/70 ring-1 ring-border")
                              }
                            >
                              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </span>
                            <p className={"text-sm leading-relaxed " + (done ? "text-muted-foreground line-through" : "")}>
                              {step.text}
                            </p>
                          </button>
                          {step.imageUrl && !hideImages && (
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(step.imageUrl!)}
                              aria-label={`Ver foto del paso ${i + 1}`}
                              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-background"
                            >
                              <ImageWithSkeleton
                                src={step.imageUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          )}
                          {hideImages && step.imageUrl && (
                            <span
                              aria-hidden
                              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-3xl"
                            >
                              {recipe.emoji}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>

        {(!readOnly || onSaveToLibrary || ownershipNotice) && (
          <div className="shrink-0 border-t border-border/60 bg-card/40 px-6 py-4 sm:px-10">
            <div className="flex items-center justify-between gap-2">
              {ownershipNotice ? (
                <span className="text-sm italic text-muted-foreground">{ownershipNotice}</span>
              ) : <span />}
              <div className="flex items-center justify-end gap-2">
              {onSaveToLibrary && (
                <button
                  type="button"
                  onClick={onSaveToLibrary}
                  disabled={savingToLibrary}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {savingToLibrary ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Guardar en mi recetario
                </button>
              )}
              {!readOnly && (
                <Link
                  to="/chef"
                  search={{ recipeId: recipe.id } as never}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-[#deccb8] px-5 text-sm font-medium text-foreground hover:bg-[#d4c0ac]"
                >
                  <Sparkles className="h-4 w-4" /> Cocinar con Kiko
                </Link>
              )}
              </div>
            </div>
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxUrl(null);
          }}
        >
          <button
            aria-label="Cerrar imagen"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <ImageWithSkeleton
              src={lightboxUrl}
              alt="Foto del paso"
              wrapperClassName="inline-block h-auto w-auto"
              className="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain"
            />
          </div>
        </div>
      )}

      {shareOpen && (
        <Suspense fallback={null}>
          <ShareRecipeModal
            recipeId={recipe.id}
            recipeTitle={recipe.title}
            onClose={() => setShareOpen(false)}
          />
        </Suspense>
      )}
    </div>,
    document.body,
  );
}

// -------- Baker's Percentage calculator (pure formula) --------

const DEFAULT_TOTAL_WEIGHT = 1000;

function BakerCalculator({ recipe }: { recipe: ViewableRecipe }) {
  const percents = useMemo(
    () => recipe.ingredients.map((ing) => parsePercent(ing.quantity)),
    [recipe.ingredients],
  );
  const pTotal = useMemo(
    () => percents.reduce<number>((acc, p) => acc + (p ?? 0), 0),
    [percents],
  );

  const [totalWeight, setTotalWeight] = useState<number>(
    () => loadBakerTotal(recipe.id) ?? DEFAULT_TOTAL_WEIGHT,
  );
  const [totalInput, setTotalInput] = useState<string>(() =>
    formatScaledQty(loadBakerTotal(recipe.id) ?? DEFAULT_TOTAL_WEIGHT),
  );
  const [gramInputs, setGramInputs] = useState<string[]>(() =>
    percents.map((p) =>
      p == null || pTotal <= 0
        ? ""
        : formatScaledQty(gramsFromPercent(p, loadBakerTotal(recipe.id) ?? DEFAULT_TOTAL_WEIGHT, pTotal)),
    ),
  );
  const focusedRef = useRef<{ kind: "total" | "gram"; index?: number } | null>(null);

  // Re-sync derived inputs when totalWeight (or the recipe formula) changes,
  // but never touch the input currently under user focus.
  useEffect(() => {
    setGramInputs((prev) =>
      percents.map((p, i) => {
        if (focusedRef.current?.kind === "gram" && focusedRef.current.index === i) {
          return prev[i] ?? "";
        }
        return p == null || pTotal <= 0
          ? ""
          : formatScaledQty(gramsFromPercent(p, totalWeight, pTotal));
      }),
    );
    if (focusedRef.current?.kind !== "total") {
      setTotalInput(formatScaledQty(totalWeight));
    }
  }, [totalWeight, percents, pTotal]);

  // Persist total weight (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveBakerTotal(recipe.id, totalWeight), 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [recipe.id, totalWeight]);

  const onTotalChange = (raw: string) => {
    setTotalInput(raw);
    if (raw === "") return; // freeze — anti-NaN
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setTotalWeight(parsed);
  };
  const onTotalBlur = () => {
    focusedRef.current = null;
    const parsed = Number(totalInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTotalInput(formatScaledQty(totalWeight));
    }
  };

  const onGramChange = (idx: number, raw: string) => {
    setGramInputs((prev) => prev.map((v, i) => (i === idx ? raw : v)));
    if (raw === "") return; // freeze others — anti-NaN
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const pct = percents[idx];
    if (pct == null || pTotal <= 0) return;
    const newTotal = totalFromIngredientGrams(parsed, pct, pTotal);
    if (!Number.isFinite(newTotal) || newTotal <= 0) return;
    setTotalWeight(newTotal);
  };
  const onGramBlur = (idx: number) => {
    focusedRef.current = null;
    const pct = percents[idx];
    if (pct == null || pTotal <= 0) return;
    const derived = formatScaledQty(gramsFromPercent(pct, totalWeight, pTotal));
    setGramInputs((prev) => prev.map((v, i) => (i === idx ? derived : v)));
  };

  const reset = () => {
    setTotalWeight(DEFAULT_TOTAL_WEIGHT);
    clearBakerTotal(recipe.id);
  };

  const noFormula = pTotal <= 0;

  return (
    <div className="mt-4 space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Peso de masa final deseado (gr)
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={totalInput}
          onFocus={() => { focusedRef.current = { kind: "total" }; }}
          onChange={(e) => onTotalChange(e.target.value)}
          onBlur={onTotalBlur}
          disabled={noFormula}
          className="h-11 w-full rounded-xl border border-primary/40 bg-card px-4 text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        {noFormula && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Esta receta aún no tiene una fórmula con porcentajes válidos.
          </p>
        )}
      </label>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="grid grid-cols-[1fr_4rem_6rem] gap-2 border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Ingrediente</span>
          <span className="text-right">%</span>
          <span className="text-right">Gramos</span>
        </div>
        <ul className="divide-y divide-border/60">
          {recipe.ingredients.map((ing, i) => {
            const pct = percents[i];
            const editable = pct != null && pTotal > 0;
            return (
              <li
                key={i}
                className="grid grid-cols-[1fr_4rem_6rem] items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm">{ing.name || "—"}</span>
                <span className="text-right text-sm font-semibold tabular-nums text-primary">
                  {pct != null ? `${formatScaledQty(pct)}%` : "—"}
                </span>
                <div className="flex items-center justify-end">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={editable ? gramInputs[i] ?? "" : ""}
                    onFocus={() => { focusedRef.current = { kind: "gram", index: i }; }}
                    onChange={(e) => onGramChange(i, e.target.value)}
                    onBlur={() => onGramBlur(i)}
                    disabled={!editable}
                    placeholder={editable ? "" : "—"}
                    aria-label={`Gramos de ${ing.name || "ingrediente"}`}
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-transparent disabled:text-muted-foreground"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Total de fórmula:{" "}
          <strong className="text-foreground tabular-nums">
            {pTotal > 0 ? `${formatScaledQty(pTotal)}%` : "—"}
          </strong>
        </span>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-card"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Restablecer
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <BookOpen className="mr-1 inline h-3 w-3" />
        Los cambios son solo para esta sesión — la receta original no se modifica.
      </p>
    </div>
  );
}

