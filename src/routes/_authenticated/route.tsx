import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth/session.client";

// ssr: false — this guard runs client-side only, so a synchronous localStorage
// read is enough (no network round-trip like the old supabase.auth.getUser()
// call). This is UX gating only: every server function independently
// enforces requireAuth regardless of what the client believes (same security
// model already documented in admin-guard.ts).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = getSession();
    if (!session || session.exp * 1000 <= Date.now()) throw redirect({ to: "/auth" });
    return { user: { id: session.userId, email: session.email } };
  },
  component: () => <Outlet />,
});
