import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Clock, Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import { isCustomCategory } from "@/lib/categories";
import { getSharedRecipe, saveSharedRecipe } from "@/lib/share.functions";

export const Route = createFileRoute("/_authenticated/shared/$shareToken")({
  head: () => ({
    meta: [{ title: "Receta compartida — Melik Recipes" }, { name: "robots", content: "noindex" }],
  }),
  component: SharedRecipePage,
});

function SharedRecipePage() {
  const { shareToken } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checkedIng, setCheckedIng] = useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["shared-recipe", shareToken],
    queryFn: () => getSharedRecipe({ data: { token: shareToken } }),
    retry: false,
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: () => saveSharedRecipe({ data: { token: shareToken } }),
    onSuccess: () => {
      toast.success("Receta añadida a tu recetario");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate({ to: "/" });
    },
    onError: (e) => {
      showError(e, "APP-RCP-004");
    },
  });

  useEffect(() => {
    // Reset scroll on token change.
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [shareToken]);

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <QueryErrorFallback
          error={error}
          hint="APP-RCP-001"
          onRetry={() => navigate({ to: "/" })}
        />
      </div>
    );
  }

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSet(next);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-32 pt-6 md:pt-10">
      <button
        type="button"
        onClick={() => navigate({ to: "/" })}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Mis Recetas
      </button>

      {data.imageUrl && (
        <div className="mt-4 overflow-hidden rounded-3xl border border-border/60">
          <img
            src={data.imageUrl}
            alt={data.title}
            loading="lazy"
            decoding="async"
            className="max-h-80 w-full object-cover"
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[color:var(--ochre)]/30 to-primary/20 px-6 pb-6 pt-8 sm:px-10 sm:pt-10">
        <div className="flex items-center gap-4">
          {!isCustomCategory(data.category) && !data.imageUrl && (
            <span
              className="grid h-16 w-16 place-items-center rounded-2xl bg-background/70 text-4xl backdrop-blur"
              aria-hidden
            >
              {data.emoji}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--ochre)]">
                {data.category}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
                <Lock className="h-3 w-3" /> Solo lectura
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Compartida
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
              {data.title}
            </h1>
            {data.originalAuthor && (
              <p className="mt-1 text-sm italic text-muted-foreground">
                Receta de <span className="font-medium not-italic">@{data.originalAuthor}</span>
              </p>
            )}
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> {data.timeMinutes} min
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-lg font-semibold">Ingredientes</h2>
          {data.ingredients.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin ingredientes anotados.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.ingredients.map((ing, i) => {
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
                      <span className={checked ? "text-muted-foreground line-through" : ""}>
                        {text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold">Pasos</h2>
          {data.instructions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin instrucciones aún.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.instructions.map((step, i) => {
                const done = doneSteps.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(doneSteps, setDoneSteps, i)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition hover:border-primary/40"
                    >
                      <span
                        className={
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold " +
                          (done
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-foreground/70 ring-1 ring-border")
                        }
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <div className="flex-1">
                        <p
                          className={
                            "text-sm leading-relaxed " +
                            (done ? "text-muted-foreground line-through" : "")
                          }
                        >
                          {step.text}
                        </p>
                        {step.imageUrl && (
                          <img
                            src={step.imageUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="mt-2 max-h-56 w-full rounded-xl border border-border object-cover"
                          />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {data.notes && (
        <section className="mt-8 rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="font-display text-sm font-semibold">Notas</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <BookOpen className="hidden h-5 w-5 flex-none text-muted-foreground sm:block" />
          <p className="hidden flex-1 text-sm text-muted-foreground sm:block">
            Al añadirla podrás editarla como una receta propia.
          </p>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:flex-none"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Añadir a mis recetas
          </button>
        </div>
      </div>
    </div>
  );
}
