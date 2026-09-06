import { useMemo } from "react";
import { useProfile } from "@/lib/use-profile";

const TEMPLATES = [
  (suffix: string) => `¿Qué descubrimos hoy${suffix}?`,
  (suffix: string) => `¿Qué tienes en mente${suffix}?`,
  (suffix: string) => `Ponme a prueba${suffix}.`,
];

export function DiscoverWelcome() {
  const { profile, isLoading, isAuthenticated } = useProfile();
  const index = useMemo(() => Math.floor(Math.random() * TEMPLATES.length), []);

  const firstName = profile?.first_name?.trim() || "";
  // Anti-flicker: while the profile is loading for an authenticated user,
  // render the base phrase without suffix and fade the suffix in when ready.
  const showSuffix = !isAuthenticated || (!isLoading && !!firstName);
  const suffix = showSuffix && firstName ? `, ${firstName}` : "";
  const title = TEMPLATES[index](suffix);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="transition-opacity duration-200" style={{ opacity: isAuthenticated && isLoading ? 0.6 : 1 }}>
        <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Pregúntame lo que quieras o adjunta fotos.
        </p>
      </div>
    </div>
  );
}
