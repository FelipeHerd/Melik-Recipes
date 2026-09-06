# Challenge Report: Milestone M2 — Melik+ Paywall & Kiko Voice Call UX

**Verdict**: **REJECT**

---

## 1. Observation

### Observation 1.1: Deep Link Race Condition in `src/routes/chef.tsx` (Lines 487–499)
In `src/routes/chef.tsx`, the `autoVoice` `useEffect` is implemented as:
```tsx
  useEffect(() => {
    if (autoVoice && voice.status === "idle") {
      if (!isAuthenticated || !isPremium) {
        setPaywallOpen(true);
      } else {
        if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
          setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
        } else {
          void voice.start();
        }
      }
    }
  }, [autoVoice, isAuthenticated, isPremium, voice]);
```
- In `src/lib/use-profile.ts`, `isLoading` is defined as `!ready || (isAuthenticated && query.isPending)`.
- When an active Melik+ user opens `/chef?voice=true` directly or refreshes the browser, `useSessionUser()` starts with `ready = false` and `isAuthenticated = false`.
- On initial mount, `autoVoice` is `true` and `voice.status` is `"idle"`. Because `isAuthenticated` is `false` during profile loading, `!isAuthenticated || !isPremium` evaluates to `true`, executing `setPaywallOpen(true)`.
- A moment later (50ms–200ms), Supabase auth finishes loading: `isAuthenticated` becomes `true` and `isPremium` becomes `true`.
- The `useEffect` fires again. Now `!isAuthenticated || !isPremium` is `false`, so it executes `void voice.start()`.
- **Flaw**: `paywallOpen` was already set to `true` during initial mount and is never reset to `false`. The active Melik+ subscriber has the **Melik+ Paywall Modal displayed on screen** while their ElevenLabs WebRTC voice call initializes in the background.

### Observation 1.2: Persistent `voice=true` Search Query Parameter
In `src/routes/chef.tsx`:
```tsx
  const { recipeId, voice: autoVoice } = useSearch({ from: "/chef" });
```
- When a free user visits `/chef?voice=true`, `setPaywallOpen(true)` opens the paywall modal.
- If the user clicks "Ahora no" (`onOpenChange(false)`), `paywallOpen` is set to `false`.
- However, `voice=true` remains in the URL search parameters.
- Any subsequent re-render of `ChefPage` (e.g. typing a message, changing attachments, or hook updates) causes the `useEffect` to re-evaluate because `autoVoice` remains `true` and `voice.status` is `"idle"`.
- **Flaw**: The paywall modal re-opens repeatedly whenever state changes occur on `/chef?voice=true`.

### Observation 1.3: `KikoVoicePaywallModal.tsx` CTA Link (Passed)
In `src/components/KikoVoicePaywallModal.tsx` (Lines 58–67):
```tsx
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
...
```
- Uses `<Link to="/melik-plus" onClick={() => onOpenChange(false)}>` wrapped in `<AlertDialogAction asChild>`.
- Correctly navigates to `/melik-plus` and closes the modal on click.

### Observation 1.4: Voice Button Visibility Across UI (Passed)
- `ChefFab.tsx` (Lines 31–40): Floating "Voz Kiko" button is visible to all users. Clicking as a free user opens `KikoVoicePaywallModal`.
- `chef.tsx` (Lines 536–555): Header "Voz Kiko" button with `<Mic className="h-4 w-4 text-[color:var(--ochre)]" />` is visible to all users.
- `chef.tsx` (Lines 768–789): Input bar mic button is visible when input is empty (`showMic = input.trim().length === 0 && !image && !attachedRecipe`).

---

## 2. Logic Chain

1. **Requirement R2**: Hands-free voice call must be accessible and visible across the UI to all users, but free users must see the Melik+ upsell modal leading to `/melik-plus`, while active Melik+ members connect to ElevenLabs voice call seamlessly.
2. **Deep Link Requirement (`/chef?voice=true`)**: Deep linking to `/chef?voice=true` must start a call for Melik+ users and show the paywall for free users.
3. **Trace of Melik+ Deep Link Navigation**:
   - `ChefPage` mounts with `autoVoice = true`.
   - `useProfile()` is asynchronously fetching user profile and auth state (`isLoading = true`).
   - `useEffect` at lines 487–499 executes immediately on mount without checking `isLoading`.
   - `!isAuthenticated` evaluates to `true` -> `setPaywallOpen(true)` is called.
   - Profile finishes loading: `isPremium = true`.
   - `useEffect` re-runs -> `voice.start()` is called.
   - `paywallOpen` remains `true`.
   - **Conclusion**: Active Melik+ users experience a broken UX where the paywall modal pops up over an active call upon deep linking or clicking "Voz Kiko" from `ChefFab`.

---

## 3. Caveats

- ElevenLabs WebRTC calls require mic hardware permissions and valid backend credentials (`getElevenLabsToken`). The bug was identified during pre-connection state evaluation before WebRTC initialization.
- No other caveats.

---

## 4. Conclusion

Milestone M2 implementation is **REJECTED** due to a critical race condition in deep link handling (`/chef?voice=true`) that shows the Melik+ paywall modal to subscribed Melik+ users when initiating a voice call via `ChefFab` or direct link.

### Required Actionable Fixes:
1. **Fix `src/routes/chef.tsx` `useEffect`**:
   - Add `if (isLoading) return;` at the beginning of the `autoVoice` effect to wait until profile/auth state resolves.
   - Ensure `setPaywallOpen(false)` is set when user is confirmed premium.
2. **Clear/Consume `voice` search parameter**:
   - Remove or replace `voice: undefined` in the search params after handling `autoVoice`, or use a ref (`autoVoiceHandledRef`) to prevent infinite paywall re-trigger loops for free users.

---

## 5. Verification Method

To verify the failure and subsequent fix:

1. **Simulate Melik+ Deep Link**:
   - Set up user context with `isLoading: true`, `isAuthenticated: false` transitioning to `isLoading: false`, `isAuthenticated: true`, `isPremium: true`.
   - Navigate to `/chef?voice=true`.
   - Observe if `paywallOpen` is set to `true` while `voice.start()` runs.
2. **Verify Paywall Modal CTA**:
   - Inspect `KikoVoicePaywallModal.tsx` line 61: `<Link to="/melik-plus">`.
3. **Verify Voice Buttons**:
   - Inspect header in `chef.tsx` line 536 and input bar line 768.

---

## Attack Surface

### Hypotheses Tested:
- **Hypothesis 1**: Free user clicking "Voz Kiko" in `ChefFab`, header, or input bar gets `KikoVoicePaywallModal` -> **CONFIRMED (PASS)**.
- **Hypothesis 2**: Modal CTA links directly to `/melik-plus` -> **CONFIRMED (PASS)**.
- **Hypothesis 3**: Deep linking to `/chef?voice=true` during initial load when profile is fetching (`isLoading: true`) triggers paywall modal before auth resolves -> **VULNERABILITY FOUND (FAIL)**.
- **Hypothesis 4**: `autoVoice` search param remains in URL after closing modal, re-triggering modal on state updates -> **VULNERABILITY FOUND (FAIL)**.

### Vulnerabilities Found:
1. `src/routes/chef.tsx` line 489: `autoVoice` effect triggers `setPaywallOpen(true)` during `isLoading = true` phase for Melik+ users.
2. `src/routes/chef.tsx` line 487: `autoVoice` search param is not cleared after processing, causing re-render loops.
