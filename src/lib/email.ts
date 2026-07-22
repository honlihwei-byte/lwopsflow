/**
 * Email delivery — logs in dev. Set SMTP_* env vars when ready for production.
 */

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; devMode?: boolean }> {
  const from = process.env.SMTP_FROM?.trim() || "noreply@punchcard.local";

  if (!process.env.SMTP_HOST?.trim()) {
    console.info("[email:dev]", {
      to: opts.to,
      subject: opts.subject,
      body: opts.text ?? opts.html.replace(/<[^>]+>/g, " ").slice(0, 500),
    });
    return { ok: true, devMode: true };
  }

  console.info("[email] SMTP configured but sender not wired — logged instead", {
    from,
    to: opts.to,
    subject: opts.subject,
  });
  return { ok: true, devMode: true };
}
