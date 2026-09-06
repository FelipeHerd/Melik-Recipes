// Full-viewport veil shown while /admin verifies permissions.
//
// Purpose: eliminate any legible flash of admin data / actionable controls
// during the verification window. It is UX-only — real access control lives
// server-side (assertAdmin + RLS).
//
// Behavior:
//  - Opaque dark backdrop + backdrop-blur.
//  - Captures all pointer + focus (aria-modal, tabIndex=-1, autofocus).
//  - The rest of the admin subtree should be marked `inert` by the caller so
//    Tab/AT cannot reach controls beneath.
//  - Respects prefers-reduced-motion (fade duration collapses to 0).

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

export function AdminAccessVeil({ visible }: { visible: boolean }) {
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (visible) focusRef.current?.focus();
  }, [visible]);

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-hidden={!visible}
      className={`fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center bg-zinc-950/95 backdrop-blur-xl transition-opacity duration-150 motion-reduce:transition-none ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex flex-col items-center gap-3 text-zinc-300">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium tracking-tight">Verificando permisos…</p>
        <span className="sr-only">Verificando permisos administrativos.</span>
      </div>
    </div>
  );
}
