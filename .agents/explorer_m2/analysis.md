# Milestone M2 Analysis & Implementation Blueprint: Melik+ Paywall & Kiko Voice Call UX

## 1. Executive Summary

Milestone M2 focuses on optimizing the user experience and access control for Kiko's hands-free voice call feature (powered by ElevenLabs WebRTC). Specifically, the Kiko voice call entry point must be visible across the application UI to all users, but actual voice interaction (`voice.start()`) must be gated exclusively to active **Melik+** subscribers. When a free or unauthenticated user attempts to start a voice call, the application must display a subtle, visually consistent paywall modal (`KikoVoicePaywallModal`) that matches Melik's design system and provides a direct CTA to `/melik-plus`.

This analysis provides the complete architectural breakdown and a step-by-step implementation plan for Worker M2.

---

## 2. Evidence & Codebase Investigation

### 2.1 File Inventory & Inspection Results

| File Path | Category | Status / Observations |
|---|---|---|
| `src/components/KikoVoicePaywallModal.tsx` | Component | **Missing** — Needs to be created following design system standards (`AlertDialog`, `font-display`, `text-[color:var(--ochre)]`, `bg-primary`). |
| `src/components/ChefFab.tsx` | Component | **Existing (21 lines)** — Currently renders only a single `Sparkles` icon link to `/chef`. Must be updated to render a dual-action floating control with a dedicated Kiko Voice Call button. |
| `src/routes/chef.tsx` | Route | **Existing (899 lines)** — `useSearch` schema lacks `voice` parameter; Mic button (line 732) directly triggers `voice.start()` without checking `isPremium`; lacks `KikoVoicePaywallModal` integration. |
| `src/hooks/use-kiko-voice.ts` | Hook | **Existing (258 lines)** — Manages ElevenLabs WebRTC session lifecycle, audio waveforms, mic permission, and usage pings (`logVoiceUsage`). |
| `src/lib/voice.server.ts` | Server Logic | **Existing (109 lines)** — Defines `VOICE_LIMIT_PREMIUM_SECONDS = 900` (15 mins) and `VOICE_LIMIT_FREE_SECONDS = 60`. `readVoiceQuota` calculates remaining time based on user profile. |
| `src/components/chef/VoiceLimitModal.tsx` | Component | **Existing (54 lines)** — Shown when a user runs out of their daily budget (used for Melik+ users reaching 15 min cap). |
| `src/lib/use-profile.ts` | Hook | **Existing (37 lines)** — Exposes `isPremium`, `isAuthenticated`, `isLoading`, `profile`. Safe for guests. |

---

## 3. Detailed Component Analysis & State Flow

### 3.1 Free vs. Melik+ User Interaction Logic

```
               [ User Clicks Kiko Voice Call Button ]
                                |
                   Is User Active Melik+ Member?
                                |
               +----------------+----------------+
               |                                 |
           [ NO ]                             [ YES ]
               |                                 |
  Display `KikoVoicePaywallModal`     Check Daily Voice Quota
  - Title: "Habla con Kiko con Melik+"          |
  - CTA -> Navigate to `/melik-plus`   +--------+--------+
  - Cancel -> Close Modal              |                 |
                                  [ Quota > 0 ]     [ Quota = 0 ]
                                       |                 |
                               Invoke `voice.start()`  Display `VoiceLimitModal`
                               ElevenLabs WebRTC       (15-min limit reached)
```

### 3.2 Key Gaps & Required Code Changes

1. **New Component: `src/components/KikoVoicePaywallModal.tsx`**
   - Must use accessible modal primitives (`AlertDialog` from `@/components/ui/alert-dialog`).
   - Must include branded styling (`Mic` icon with `ochre` background badge, header title, body text explaining hands-free cooking).
   - Primary CTA: `<Link to="/melik-plus">` styled as primary button with `<Crown className="h-4 w-4" /> Desbloquear Melik+`.
   - Secondary CTA: "Ahora no" cancel action.

2. **Refactored `src/components/ChefFab.tsx`**
   - Must render a floating button group (bottom right):
     - **Voice Call Button**: `<button onClick={handleVoiceClick}>` displaying `<Mic className="h-4 w-4" />` and label `"Voz Kiko"`.
     - **Chat FAB Button**: `<Link to="/chef">` displaying `<Sparkles className="h-5 w-5" />`.
   - `handleVoiceClick`:
     - If `!isAuthenticated || !isPremium`: open `KikoVoicePaywallModal`.
     - If `isPremium`: navigate to `/chef?voice=true`.

3. **Updated `src/routes/chef.tsx`**
   - Update `searchSchema`:
     ```ts
     const searchSchema = z.object({
       recipeId: z.string().optional(),
       voice: z.coerce.boolean().optional(),
     });
     ```
   - Destructure `isPremium` from `useProfile()`:
     ```ts
     const { profile, isLoading, isAuthenticated, isPremium } = useProfile();
     ```
   - Add state: `const [paywallOpen, setPaywallOpen] = useState(false);`
   - Handle `voice` query parameter on route enter:
     ```ts
     useEffect(() => {
       if (autoVoice && voice.status === "idle") {
         if (!isAuthenticated || !isPremium) {
           setPaywallOpen(true);
         } else {
           void voice.start();
         }
       }
     }, [autoVoice, isAuthenticated, isPremium, voice]);
     ```
   - Update Mic button `onClick` in bottom input bar:
     ```ts
     onClick={() => {
       if (!isAuthenticated || !isPremium) {
         setPaywallOpen(true);
         return;
       }
       if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
         setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
         return;
       }
       void voice.start();
     }}
     ```
   - Render `<KikoVoicePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />`.

---

## 4. Worker M2 Step-by-Step Implementation Blueprint

### Step 1: Create `src/components/KikoVoicePaywallModal.tsx`

Create file `src/components/KikoVoicePaywallModal.tsx` with exact implementation:

```tsx
import { Link } from "@tanstack/react-router";
import { Crown, Mic, Volume2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function KikoVoicePaywallModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
        <AlertDialogHeader className="items-center text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--ochre)]/15 text-[color:var(--ochre)] shadow-sm">
            <Mic className="h-7 w-7" />
          </div>
          <AlertDialogTitle className="font-display text-2xl font-semibold text-foreground">
            Habla con Kiko con Melik+
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
            La interacción por voz en tiempo real con Kiko es una función exclusiva de{" "}
            <span className="font-semibold text-foreground">Melik+</span>. Cocina con las manos libres mientras Kiko te guía paso a paso por tus recetas.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 space-y-2.5 rounded-2xl bg-card/60 p-4 border border-border/50 text-left text-xs text-foreground/80">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Mic className="h-3.5 w-3.5" />
            </span>
            <span>Asistente por voz en tiempo real con inteligencia artificial</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Volume2 className="h-3.5 w-3.5" />
            </span>
            <span>Guía paso a paso con manos libres mientras cocinas</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Crown className="h-3.5 w-3.5" />
            </span>
            <span>Hasta 15 minutos diarios de llamada de voz con Kiko</span>
          </div>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction asChild className="w-full">
            <Link
              to="/melik-plus"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90"
            >
              <Crown className="h-4 w-4" /> Desbloquear Melik+
            </Link>
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
            className="mt-0 h-10 w-full rounded-xl border-border bg-background text-sm font-medium text-foreground/70 hover:bg-card hover:text-foreground"
          >
            Ahora no
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Step 2: Refactor `src/components/ChefFab.tsx`

Update `src/components/ChefFab.tsx` to expose the voice call button across all pages:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mic, Sparkles } from "lucide-react";
import { useProfile } from "@/lib/use-profile";
import { KikoVoicePaywallModal } from "@/components/KikoVoicePaywallModal";

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
```

### Step 3: Update `src/routes/chef.tsx`

Make the following surgical additions to `src/routes/chef.tsx`:
1. Add `voice: z.coerce.boolean().optional()` to `searchSchema`.
2. Import `KikoVoicePaywallModal`.
3. Destructure `isPremium` from `useProfile()`.
4. Extract `voice: autoVoice` from `useSearch({ from: "/chef" })`.
5. Add state `[paywallOpen, setPaywallOpen] = useState(false)`.
6. Add `useEffect` for `autoVoice`.
7. Update Mic button click handler to check `!isAuthenticated || !isPremium`.
8. Render `<KikoVoicePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />`.

---

## 5. Verification Protocol for Worker M2

1. **Build Verification**: Run `npm run build` to confirm zero TypeScript compilation errors or missing imports.
2. **Visual & UI Verification**:
   - Check floating `ChefFab` on home screen (`/`): voice button ("Voz Kiko") and chat button ("Sparkles") are both visible.
   - Click voice button as non-Melik+ user: `KikoVoicePaywallModal` appears centered on screen.
   - Click "Desbloquear Melik+": user is navigated to `/melik-plus`.
   - Click Mic button in `/chef` as non-Melik+ user: `KikoVoicePaywallModal` opens immediately.
   - As active Melik+ user: clicking voice call button initializes ElevenLabs WebRTC call (`voice.start()`).
