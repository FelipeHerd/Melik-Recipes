import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { z } from "zod";
import { Sparkles, Lock } from "lucide-react";
import { useSessionUser } from "@/components/UserMenu";
import { DiscoverChatSkeleton } from "@/components/DiscoverChatSkeleton";

const descubrirSearchSchema = z.object({
  tab: z.enum(["kiko", "comunidad"]).default("kiko").optional(),
});

export const Route = createFileRoute("/descubrir")({
  ssr: false,
  validateSearch: descubrirSearchSchema,
  head: () => ({
    meta: [
      { title: "Descubrir — Melik Recipes" },
      {
        name: "description",
        content:
          "Chatea con Kiko, nuestro asistente con Inteligencia Artificial, y explora la comunidad de recetas Melik.",
      },
      { property: "og:title", content: "Descubrir — Chef con IA + Comunidad" },
      { property: "og:description", content: "Descubre nuevas recetas con IA multimodal y explora la comunidad." },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/descubrir" }],
  }),
  component: DescubrirLayout,
});

function DescubrirLayout() {
  const { userId, ready } = useSessionUser();

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col md:h-dvh md:px-4 md:py-4">
      <section className="flex min-h-0 flex-1 flex-col rounded-none border-border/60 bg-card/30 md:rounded-3xl md:border">
        {!ready ? (
          <DiscoverChatSkeleton />
        ) : !userId ? (
          <GuestBlock />
        ) : (
          <Outlet />
        )}
      </section>
    </div>
  );
}

function GuestBlock() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
        <Lock className="h-7 w-7" />
      </span>
      <div>
        <h2 className="font-display text-2xl font-semibold">Descubre nuevas recetas con IA</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Inicia sesión o regístrate gratis para chatear con Kiko, nuestro asistente con
          Inteligencia Artificial, adjuntar fotos de tus ingredientes y guardar tus chats.
        </p>
      </div>
      <Link
        to="/auth"
        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <Sparkles className="h-4 w-4" /> Iniciar sesión
      </Link>
    </div>
  );
}
