# Handoff Report: Milestone M2 (Melik+ Paywall & Kiko Voice Call UX)

## 1. Observation

- **File Path**: `src/components/KikoVoicePaywallModal.tsx`
  - Observation: File does not exist in the codebase.
- **File Path**: `src/components/ChefFab.tsx`
  - Lines 9-19: `ChefFab` component renders a single `<Link to="/chef">` with `<Sparkles className="h-5 w-5" />`. It lacks a direct Kiko voice call button.
- **File Path**: `src/routes/chef.tsx`
  - Line 38: `searchSchema` validates `recipeId: z.string().optional()`, but lacks `voice` boolean flag.
  - Line 135: `const { profile, isLoading, isAuthenticated } = useProfile();` — `isPremium` is not destructured.
  - Lines 732-760: Mic button `onClick` handler calls `voice.start()` directly without checking `isPremium` or triggering a paywall modal for free users.
- **File Path**: `src/hooks/use-kiko-voice.ts`
  - Lines 109-170: `start()` initiates WebRTC session via `getElevenLabsToken()`.
- **File Path**: `src/components/chef/VoiceLimitModal.tsx`
  - Lines 15-53: Alert dialog handling quota expiration for free/premium users.

## 2. Logic Chain

1. *From Observation 1*: `KikoVoicePaywallModal.tsx` is required by feature inventory and requirements to present a subtle, visually consistent paywall prompt when free users click the voice call button. Because it does not exist, a new component must be created using the application's `AlertDialog` and design system tokens.
2. *From Observation 2*: Requirement 1 states that the Kiko hands-free voice call button must be visible across the UI (`ChefFab.tsx`, `chef.tsx`, etc.). Currently `ChefFab.tsx` only renders a chat button (`Sparkles`). Adding a dedicated `Mic` button ("Voz Kiko") to `ChefFab.tsx` fulfills this requirement for all pages.
3. *From Observation 3*: Requirement 2 states that free users clicking the voice button must see `KikoVoicePaywallModal` with a CTA to `/melik-plus`. Requirement 3 states that active Melik+ users must be allowed to start ElevenLabs voice calls. In `chef.tsx`, destructured `isPremium` from `useProfile()` allows checking subscription status before invoking `voice.start()`. If `!isPremium`, `setPaywallOpen(true)` triggers `KikoVoicePaywallModal`.
4. *From Observation 3 & 2*: Adding `voice: z.coerce.boolean().optional()` to `searchSchema` in `chef.tsx` allows `ChefFab.tsx` to navigate Melik+ users to `/chef?voice=true` to immediately trigger hands-free voice calling.

## 3. Caveats

- **ElevenLabs API Credentials**: Testing live WebRTC voice connections requires `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in environment variables. However, frontend UI paywall logic (`isPremium` check and `KikoVoicePaywallModal` display) can be fully verified in local development without live API keys.
- **No Caveats** regarding design system or component layout.

## 4. Conclusion

Milestone M2 requirement analysis is complete. A precise step-by-step implementation guide has been compiled in `analysis.md`. Worker M2 can execute the implementation by creating `KikoVoicePaywallModal.tsx`, updating `ChefFab.tsx`, and modifying `chef.tsx` to enforce the Melik+ paywall guard on voice interaction while keeping the voice call button visible to all users.

## 5. Verification Method

To verify the implementation once applied by Worker M2:
1. Run `npm run build` in working directory `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes` to ensure 0 build errors.
2. Inspect `src/components/KikoVoicePaywallModal.tsx` to confirm component structure and CTA `<Link to="/melik-plus">`.
3. Inspect `src/components/ChefFab.tsx` to verify presence of Kiko voice call button and paywall check.
4. Inspect `src/routes/chef.tsx` to verify `isPremium` guard on voice call trigger and modal integration.
