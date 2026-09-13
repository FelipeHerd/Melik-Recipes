import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { BookOpen, Croissant, Compass, Crown, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { PageFallback } from "@/components/PageFallback";
import { ModalFallback } from "@/components/ModalFallback";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { RecipesProvider } from "@/lib/recipes-context";
import { UserMenu, SidebarUsername } from "@/components/UserMenu";
import { GuestMigrationModal } from "@/components/GuestMigrationModal";
import { TrialBanner } from "@/components/TrialBanner";
import { NotificationsButton } from "@/components/NotificationsButton";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
// Pilar 5: cajón de chats de Descubrir se carga solo al entrar a esa sección.
const DiscoverChatDrawer = lazy(() =>
  import("@/components/DiscoverChatDrawer").then((m) => ({ default: m.DiscoverChatDrawer })),
);
const DiscoverSidebarSection = lazy(() =>
  import("@/components/DiscoverSidebarSection").then((m) => ({
    default: m.DiscoverSidebarSection,
  })),
);
// Served straight from public/ (see CLAUDE.md) — the Lovable-hosted asset
// manifests these used to import from are gone along with Lovable's CDN.
const melikLogo = { url: "/melik-logo.png" };
const melikBakeryLogo = { url: "/melik-bakery-logo.png" };

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">Esta página no existe.</p>
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">Intenta de nuevo en un momento.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "yVgtz1aHfpMU-IxoUfPyRu45ROkLRe4VXE7MqnnzF2w" },
      { title: "Melik Recipes — Tu recetario con asistente IA" },
      { name: "description", content: "Organiza tus recetas favoritas y cocina con la ayuda de un asistente IA." },
      { property: "og:title", content: "Melik Recipes — Tu recetario con asistente IA" },
      { name: "twitter:title", content: "Melik Recipes — Tu recetario con asistente IA" },
      { property: "og:description", content: "Organiza tus recetas favoritas y cocina con la ayuda de un asistente IA." },
      { name: "twitter:description", content: "Organiza tus recetas favoritas y cocina con la ayuda de un asistente IA." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0e6e5ea3-6f80-4cda-958d-3358547f742a" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0e6e5ea3-6f80-4cda-958d-3358547f742a" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Gabarito:wght@400;500;600;700&display=swap" },
      { rel: "preload", as: "image", href: melikLogo.url, fetchPriority: "high" } as unknown as { rel: string; href: string },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Melik Recipes",
          url: "https://melik-recipes.lovable.app",
          applicationCategory: "Culinary & Recipe Management Application",
          inLanguage: "es",
          description:
            "Organiza tus recetas favoritas y cocina con la ayuda de un asistente IA.",
          creator: {
            "@type": "Organization",
            name: "Melik Bakery",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Melik Bakery",
          url: "https://melik-recipes.lovable.app",
          logo: "https://melik-recipes.lovable.app/favicon.ico",
        }),
      },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

const navItems = [
  { to: "/", label: "Mis Recetas", icon: BookOpen },
  { to: "/melik-bakery", label: "Melik Bakery", icon: Croissant },
  { to: "/melik-plus", label: "Melik+", icon: Crown },
  { to: "/descubrir", label: "Descubrir", icon: Compass },
] as const;

const SIDEBAR_KEY = "meliks.sidebar.collapsed";

function AppShell() {
  usePresenceHeartbeat();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDescubrirRoot = pathname === "/descubrir";
  const isDescubrirChat = /^\/descubrir\/[^/]+/.test(pathname);
  const isDescubrir = isDescubrirRoot || isDescubrirChat;
  const isChef = pathname === "/chef";
  const isMobileChatView = isDescubrir || isChef;
  const hideShell =
    pathname.startsWith("/auth") || pathname === "/admin" || pathname.startsWith("/admin/");


  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  if (hideShell) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    );
  }

  const asideWidth = collapsed ? "md:w-24" : "md:w-64";
  const mainPad = collapsed ? "md:pl-24" : "md:pl-64";
  const asidePad = collapsed ? "md:px-3" : "md:px-5";
  // Text reveal animation shared classes (slide from under the icon/logo on the left)
  const textReveal = `inline-block whitespace-nowrap transition-all duration-200 ease-out motion-reduce:transition-none ${
    collapsed
      ? "opacity-0 -translate-x-3 max-w-0 overflow-hidden"
      : "opacity-100 translate-x-0 max-w-[220px]"
  }`;

  return (
    <div className={`bg-background text-foreground ${isMobileChatView ? "h-[100dvh] overflow-hidden flex flex-col md:block md:min-h-dvh md:h-auto md:overflow-visible" : "min-h-dvh"}`}>
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar py-7 md:flex transition-[width] duration-200 ease-out ${asideWidth} ${asidePad}`}
      >
        {/* Right border with gradient opacity mask — fades where the logo sits so it never gets clipped visually */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-border [mask-image:linear-gradient(to_bottom,transparent_0px,transparent_96px,black_150px,black_100%)]"
        />

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-foreground/70 hover:bg-card hover:text-foreground transition-colors z-10"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <Link
          to="/"
          className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "justify-center" : ""}`}
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-card overflow-hidden">
            <img src={melikLogo.url} alt="Melik Recipes" width={52} height={52} fetchPriority="high" decoding="async" className="h-[52px] w-[52px] object-contain" />
          </span>
          <span
            aria-hidden={collapsed}
            className={`font-display text-xl font-semibold leading-tight ${textReveal}`}
          >
            Melik<br />
            Recipes
          </span>
        </Link>
        <nav className="mt-10 flex flex-1 min-h-0 flex-col gap-1.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            const isDescubrirItem = item.to === "/descubrir";
            const showDescubrirSection = isDescubrirItem && isDescubrir;
            return (
              <div
                key={item.to}
                className={
                  showDescubrirSection
                    ? "flex min-h-0 flex-1 flex-col"
                    : isDescubrirItem
                    ? "flex flex-col"
                    : undefined
                }
              >
                <Link
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 overflow-hidden rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-card"}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? "translate-x-1.5" : "translate-x-0"}`} />
                  <span aria-hidden={collapsed} className={textReveal}>{item.label}</span>
                </Link>
                {showDescubrirSection && (
                  <Suspense fallback={null}>
                    <DiscoverSidebarSection collapsed={collapsed} />
                  </Suspense>
                )}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto flex shrink-0 flex-col gap-3">
          <div className="flex flex-col items-center gap-2">
            <UserMenu compact={collapsed} />
            <SidebarUsername collapsed={collapsed} />
          </div>
          {/* Bakery footer — single element that morphs between collapsed/expanded so the text is revealed as the logo passes */}
          <div
            className={`relative flex items-center overflow-hidden rounded-2xl bg-card transition-all duration-200 ease-out ${
              collapsed ? "justify-center p-2" : "justify-between gap-3 p-3"
            }`}
          >
            <a
              href="https://www.melikbakery.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-hidden={collapsed}
              className={`truncate text-xs text-muted-foreground transition-all duration-200 ease-out motion-reduce:transition-none hover:text-foreground hover:underline ${
                collapsed
                  ? "opacity-0 translate-x-4 max-w-0"
                  : "opacity-100 translate-x-0 max-w-[160px] delay-75"
              }`}
            >
              By Melik Bakery
            </a>
            <img
              src={melikBakeryLogo.url}
              alt="Melik Bakery"
              width={40}
              height={40}
              loading="lazy"
              decoding="async"
              className={`shrink-0 object-contain transition-all duration-200 ease-out motion-reduce:transition-none ${
                collapsed ? "h-10 w-10" : "h-8 w-8"
              }`}
            />
          </div>
        </div>
      </aside>

      {/* Mobile header — se oculta en /chef porque esa vista tiene su propio header unificado */}
      {!isChef && (
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2.5 border-b border-border bg-background/80 px-5 py-3 backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-card overflow-hidden">
              <img src={melikLogo.url} alt="Melik Recipes" width={40} height={40} fetchPriority="high" decoding="async" className="h-10 w-10 object-contain" />
            </span>
            <span className="font-display text-lg font-semibold leading-tight">Melik<br />Recipes</span>
          </Link>
          <div className="flex items-center gap-2">
            {isDescubrir && (
              <Suspense fallback={<ModalFallback />}>
                <DiscoverChatDrawer />
              </Suspense>
            )}
            <NotificationsButton variant="inline" active={pathname === "/notificaciones"} />
            <UserMenu />
          </div>
        </header>
      )}

      <NotificationsButton variant="floating" />

      <main className={`transition-[padding] duration-200 ease-out ${mainPad} ${isMobileChatView ? "flex-1 min-h-0 overflow-hidden pb-0" : "pb-24 md:pb-0"}`}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>


      {/* Mobile bottom nav */}
      {!isDescubrirChat && !isChef && (
        <MobileBottomNav
          pathname={pathname}
          floating={!isDescubrirRoot && !isChef}
        />
      )}
    </div>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <RecipesProvider>
        <AppShell />
        <TrialBanner />
        <GuestMigrationModal />
        <Toaster richColors position="top-center" />
      </RecipesProvider>
    </QueryClientProvider>
  );
}

function MobileBottomNav({ pathname, floating }: { pathname: string; floating: boolean }) {
  // Mobile order: Descubrir | Mis Recetas | Melik Bakery (Mis Recetas stays centered).
  const mobileNavItems = [
    { to: "/descubrir", label: "Descubrir", icon: Compass },
    { to: "/", label: "Mis Recetas", icon: BookOpen },
    { to: "/melik-bakery", label: "Melik Bakery", icon: Croissant },
  ] as const;

  const currentIndex = mobileNavItems.findIndex((i) => i.to === pathname);
  const [lastIndex, setLastIndex] = useState(currentIndex >= 0 ? currentIndex : 0);
  useEffect(() => {
    if (currentIndex >= 0) setLastIndex(currentIndex);
  }, [currentIndex]);
  const pillIndex = currentIndex >= 0 ? currentIndex : lastIndex;
  const pillVisible = currentIndex >= 0;

  return (
    <nav
      className={`z-30 border-t border-border bg-background/95 backdrop-blur md:hidden ${
        floating
          ? "fixed inset-x-0 bottom-0"
          : "relative shrink-0 [html:has(textarea:focus)_&]:hidden"
      }`}
    >
      <div className="relative grid grid-cols-3">
        {/* Sliding ochre pill */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-0 w-1/3 px-3 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{
            transform: `translateX(${pillIndex * 100}%) scale(${pillVisible ? 1 : 0})`,
            transformOrigin: "center",
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{ backgroundColor: "color-mix(in oklab, var(--ochre) 70%, transparent)" }}
          />
        </div>
        {mobileNavItems.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="relative flex flex-col items-center py-2.5">
              <span
                className={`flex flex-col items-center gap-0.5 px-4 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  active ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
