import { Link } from "@tanstack/react-router";
import { Users, MessageCircle } from "lucide-react";

export function DiscoverTabPill({ tab }: { tab: "kiko" | "comunidad" }) {
  return (
    <div className="relative mx-auto mt-3 flex w-full max-w-xs items-center rounded-full bg-muted p-1 text-sm font-medium">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: tab === "comunidad" ? "translateX(100%)" : "translateX(0%)" }}
      />
      <Link
        to="/descubrir"
        search={{ tab: "kiko" }}
        className={
          "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition-colors " +
          (tab === "kiko" ? "text-foreground" : "text-muted-foreground")
        }
      >
        <MessageCircle className="h-3.5 w-3.5" /> Kiko
      </Link>
      <Link
        to="/descubrir"
        search={{ tab: "comunidad" }}
        className={
          "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition-colors " +
          (tab === "comunidad" ? "text-foreground" : "text-muted-foreground")
        }
      >
        <Users className="h-3.5 w-3.5" /> Comunidad
      </Link>
    </div>
  );
}
