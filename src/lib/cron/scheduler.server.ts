// In-process scheduler replacing Supabase's pg_cron. Runs both daily jobs at
// 03:00 server time. Guarded against double-init across Vite/Nitro dev-mode
// HMR reloads and multiple module evaluations.
import cron from "node-cron";
import { runMelikPlusRenew, runTrialExpiringReminder } from "@/lib/cron/jobs.server";

declare global {
  var __melikCronStarted: boolean | undefined;
}

export function startScheduler(): void {
  if (globalThis.__melikCronStarted) return;
  globalThis.__melikCronStarted = true;

  cron.schedule("0 3 * * *", async () => {
    try {
      const result = await runTrialExpiringReminder();
      console.log("[cron] trial-expiring-reminder", result);
    } catch (err) {
      console.error("[cron] trial-expiring-reminder failed", err);
    }
  });

  cron.schedule("0 3 * * *", async () => {
    try {
      const result = await runMelikPlusRenew();
      console.log("[cron] melik-plus-renew", result);
    } catch (err) {
      console.error("[cron] melik-plus-renew failed", err);
    }
  });

  console.log("[cron] scheduler started");
}
