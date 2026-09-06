import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mic, Sparkles } from "lucide-react";
import { useProfile } from "@/lib/use-profile";
import { KikoVoicePaywallModal } from "@/components/KikoVoicePaywallModal";

/**
 * Prominent, thumb-reachable entry to the Chef Assistant & Kiko Voice.
 * Fixed above the mobile bottom nav; visible on all breakpoints.
 */
export function ChefFab({ recipeId }: { recipeId?: string }) {
  const { isPremium, isAuthenticated } = useProfile();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const navigate = useNavigate();

  const handleVoiceCallClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !isPremium) {
      setPaywallOpen(true);
    } else {
      void navigate({
        to: "/chef",
        search: { recipeId, voice: true } as never,
      });
    }
  };

  return (
    <>
      <div className="fixed bottom-24 right-5 z-30 flex items-center gap-2 md:bottom-8 md:right-8">
        <button
          type="button"
          onClick={handleVoiceCallClick}
          aria-label="Llamar a Kiko por voz"
          title="Llamar a Kiko por voz"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[color:var(--ochre)] px-4 text-foreground shadow-xl shadow-[color:var(--ochre)]/20 transition hover:scale-105 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium text-xs"
        >
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline font-semibold">Voz Kiko</span>
        </button>

        <Link
          to="/chef"
          search={recipeId ? ({ recipeId } as never) : undefined}
          aria-label="Abrir asistente Kiko"
          title="Chatear con Kiko"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition hover:scale-110 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="h-5 w-5" />
        </Link>
      </div>

      <KikoVoicePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}

