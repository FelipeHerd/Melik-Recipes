// No SMTP is wired up yet (per the migration plan's "skip email for now"
// decision). This stub logs instead of sending, so `requestPasswordReset`
// keeps working end-to-end and the pending token is retrievable via the
// admin panel. Swap this function's body for a real `nodemailer` transport
// when SMTP credentials are available — no callers need to change.
export async function sendResetEmail(email: string, token: string): Promise<void> {
  console.log(`[mailer] Password reset requested for ${email}. Token: ${token}`);
}
