import { useEffect } from "react";

let activeModalLocks = 0;
let previousBodyOverflow = "";

/**
 * Consistent modal a11y:
 * - Close on Escape.
 * - Lock body scroll while open.
 */
export function useModalA11y(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    if (activeModalLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalLocks += 1;

    return () => {
      window.removeEventListener("keydown", onKey);
      activeModalLocks = Math.max(0, activeModalLocks - 1);
      if (activeModalLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [enabled, onClose]);
}
