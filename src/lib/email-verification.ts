import { createHash, randomBytes, randomInt } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/app-url";

type Supabase = ReturnType<typeof createAdminClient>;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export async function createEmailVerification(
  supabase: Supabase,
  companyId: string,
  email: string,
): Promise<{ token: string; otp: string; verifyUrl: string }> {
  const token = generateVerificationToken();
  const otp = generateOtp();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await supabase.from("email_verification_tokens").delete().eq("company_id", companyId);

  const { error } = await supabase.from("email_verification_tokens").insert({
    company_id: companyId,
    email: email.toLowerCase(),
    token_hash: tokenHash,
    otp_code: otp,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);

  const base = getAppBaseUrl();
  const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(token)}`;

  return { token, otp, verifyUrl };
}

export async function sendVerificationEmail(
  email: string,
  companyName: string,
  verifyUrl: string,
  otp: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: `Verify your email — ${companyName}`,
    html: `
      <p>Welcome to Punch Card System.</p>
      <p>Verify your email to activate your company account and receive your Company ID.</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p>Or enter this code on the verification page: <strong>${otp}</strong></p>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Verify: ${verifyUrl}\nCode: ${otp}`,
  });
}

export async function verifyEmailToken(
  supabase: Supabase,
  rawToken: string,
): Promise<{ companyId: string; email: string } | null> {
  const tokenHash = hashToken(rawToken.trim());
  const { data, error } = await supabase
    .from("email_verification_tokens")
    .select("id, company_id, email, expires_at, verified_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.verified_at) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;

  await supabase
    .from("email_verification_tokens")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", data.id);

  return { companyId: String(data.company_id), email: String(data.email) };
}

export async function verifyEmailOtp(
  supabase: Supabase,
  email: string,
  otp: string,
): Promise<{ companyId: string } | null> {
  const { data, error } = await supabase
    .from("email_verification_tokens")
    .select("id, company_id, otp_code, expires_at, verified_at")
    .ilike("email", email.trim())
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  if (String(data.otp_code) !== otp.trim()) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;

  await supabase
    .from("email_verification_tokens")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", data.id);

  return { companyId: String(data.company_id) };
}
