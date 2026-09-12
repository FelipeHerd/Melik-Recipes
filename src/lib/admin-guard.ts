// Shared client-side guard for /admin and its sub-routes.
//
// Security note: this is UX/routing hardening. Every server function under
// the admin panel independently enforces `assertAdmin` (admin-only, dev does
// NOT count) plus RLS on the tables. Removing/bypassing this file cannot
// grant an attacker access to admin data — it only affects what the browser
// renders during the verification window.

import { redirect, isRedirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { getSession } from "@/lib/auth/session.client";
import { checkIsAdmin } from "@/lib/admin.functions";
import type { QueryClient } from "@tanstack/react-query";

const REJECTION_TOAST_ID = "admin-access-denied";

function bounceHome(reason: "no-session" | "not-admin" | "error"): never {
  // One toast per rejection burst; sonner dedupes by id.
  if (reason !== "no-session") {
    toast.info("Necesitas permisos de administrador para acceder al panel.", {
      id: REJECTION_TOAST_ID,
    });
  }
  throw redirect({ to: "/", replace: true });
}

/**
 * Runs inside `beforeLoad` of /admin and each sub-route.
 * Order:
 *  1. Synchronous cached session — no session → bounce to /.
 *  2. Cached role from React Query — if already known non-admin, bounce fast.
 *  3. Authoritative server check with a 1200ms race, so a hung network never
 *     leaves the user staring at a veiled admin shell.
 */
export async function assertAdminOrRedirect(queryClient?: QueryClient): Promise<void> {
  const session = getSession();
  const userId = session && session.exp * 1000 > Date.now() ? session.userId : null;
  if (!userId) bounceHome("no-session");

  if (queryClient) {
    const cached = queryClient.getQueryData<{ isAdmin?: boolean; role?: string }>([
      "is-admin",
      userId,
    ]);
    if (cached && cached.role && cached.role !== "admin") {
      bounceHome("not-admin");
    }
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 1200),
  );

  try {
    const res = await Promise.race([checkIsAdmin(), timeout]);
    if (!res || (res as { isAdmin?: boolean }).isAdmin !== true) {
      bounceHome("not-admin");
    }
    // Warm the cache so subsequent guards skip the roundtrip.
    if (queryClient) {
      queryClient.setQueryData(["is-admin", userId], res);
    }
  } catch (err) {
    if (isRedirect(err)) throw err;
    bounceHome("error");
  }
}

