import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminMobileNav } from "@/components/AdminMobileNav";
import { AdminAccessVeil } from "@/components/admin/AdminAccessVeil";
import { useProfile } from "@/lib/use-profile";
import { useIsAdmin } from "@/lib/use-admin";
import { assertAdminOrRedirect } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Panel administrativo — Melik Recipes" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    await assertAdminOrRedirect((context as { queryClient?: any })?.queryClient);
  },
  pendingComponent: () => <AdminAccessVeil visible />,
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const { role, isLoading: profileLoading } = useProfile();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [hardTimeout, setHardTimeout] = useState(false);

  // The veil covers the admin shell while React Query rehydrates role/admin
  // signals in the client. beforeLoad already confirmed admin server-side,
  // but if the live signal disagrees we expel immediately.
  const verifying = profileLoading || adminLoading;
  const denied = !verifying && (role !== "admin" || !isAdmin);
  const veilOn = verifying || denied || hardTimeout;

  // Hard timeout: if verification never resolves in 1200ms, bounce home
  // instead of leaving the user staring at a veil.
  useEffect(() => {
    if (!verifying) return;
    const t = setTimeout(() => setHardTimeout(true), 1200);
    return () => clearTimeout(t);
  }, [verifying]);

  useEffect(() => {
    if (!denied && !hardTimeout) return;
    toast.info("Necesitas permisos de administrador para acceder al panel.", {
      id: "admin-access-denied",
    });
    navigate({ to: "/", replace: true });
  }, [denied, hardTimeout, navigate]);

  // Re-verify on every mount / route match so BFCache / back-forward can't
  // resurrect a stale privileged shell.
  useEffect(() => {
    void router.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      {/*
        `inert` blocks Tab/focus and pointer events across the subtree while
        the veil is up. React types don't include `inert` yet on all versions,
        so we spread it as a string attribute.
      */}
      <div
        {...(veilOn ? { inert: "" as unknown as boolean } : {})}
        aria-hidden={veilOn}
        className={`flex w-full min-h-dvh flex-1 flex-col md:flex-row ${
          veilOn ? "pointer-events-none select-none" : ""
        }`}
      >
        <AdminSidebar />
        <AdminMobileNav />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <AdminAccessVeil visible={veilOn} />
    </div>
  );
}
