import { useEffect, useState } from "react";

// Client-side session store, replacing Supabase's internal `onAuthStateChange`
// / `getSession()` machinery. Backed by localStorage (same persistence model
// Supabase used) with an in-memory pub-sub for same-tab reactivity and a
// `storage` event listener for cross-tab sync.
const STORAGE_KEY = "melik-session";

export type Session = { token: string; userId: string; email: string; exp: number };

let currentSession: Session | null = readFromStorage();
const listeners = new Set<() => void>();

function readFromStorage(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getSession(): Session | null {
  return currentSession;
}

export function getToken(): string | null {
  return currentSession?.token ?? null;
}

export function setSession(session: Session | null): void {
  currentSession = session;
  if (typeof window !== "undefined") {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — session still works in-memory
      // for this tab, it just won't survive a reload.
    }
  }
  emit();
}

export function clearSession(): void {
  setSession(null);
}

export function subscribeSession(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      currentSession = readFromStorage();
      emit();
    }
  });
}

// Generalized replacement for the `useSessionUser()` that used to live in
// UserMenu.tsx, now shared by every component that needs the current user id
// (UserMenu, NotificationsButton, recipes-context, notificaciones,
// _authenticated/route, profile, admin-guard, errors/toast).
export function useSessionUser() {
  const [state, setState] = useState<{ userId: string | null; ready: boolean }>({
    userId: null,
    ready: false,
  });
  useEffect(() => {
    setState({ userId: getSession()?.userId ?? null, ready: true });
    return subscribeSession(() => {
      setState({ userId: getSession()?.userId ?? null, ready: true });
    });
  }, []);
  return state;
}
