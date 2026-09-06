## 2026-08-13T15:28:38Z
You are Worker M2 for Melik Recipes v2.
Your working directory is: c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/worker_m2

Please read:
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/ORIGINAL_REQUEST.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/PROJECT.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m2/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task for Milestone M2 (Melik+ Paywall & Kiko Voice Call UX):
1. Create `src/components/KikoVoicePaywallModal.tsx`:
   - Subtle, visually consistent modal using `AlertDialog` in the app's exact design system.
   - Title explaining hands-free voice call with Kiko is a Melik+ feature.
   - Feature bullet points (hands-free cooking assistant, real-time voice guidance).
   - CTA button navigating directly to `/melik-plus` (`<Link to="/melik-plus">`).
2. Update `src/components/ChefFab.tsx`:
   - Make Kiko hands-free voice call button visible to all users alongside chat FAB button.
   - If free user clicks voice call button, open `KikoVoicePaywallModal`.
   - If Melik+ user clicks voice call button, navigate to `/chef?voice=true`.
3. Update `src/routes/chef.tsx`:
   - Add `voice: z.coerce.boolean().optional()` to `searchSchema`.
   - Destructure `isPremium` from `useProfile()`.
   - Ensure voice call button is visible in header and input area to all users.
   - When clicked by free user (`!isPremium`), show `KikoVoicePaywallModal`.
   - When clicked by active Melik+ user (`isPremium`), start ElevenLabs WebRTC voice call (`voice.start()`).
   - If `search.voice` query param is present on mount and `isPremium` is true, auto-trigger `voice.start()`.
4. Run build verification (e.g. `npx tsc --noEmit` or `npm run build`) and document the result.
5. Write your implementation summary and handoff report to `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/worker_m2/handoff.md`.
Send a message back to parent when completed.
