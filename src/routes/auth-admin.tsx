// Legacy public admin-login page — retired.
//
// Admins now sign in through the regular /auth flow and enter the panel via
// the "Abrir panel" button in /profile. Typing /auth-admin in the URL bar
// should not reveal any admin surface, not even the existence of a login
// screen. We keep the file so old links don't break; it just bounces home.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth-admin")({
  head: () => ({
    meta: [{ title: "Melik Recipes" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
