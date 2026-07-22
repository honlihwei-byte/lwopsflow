import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";

export { normalizePunchQrToken } from "@/lib/punch-qr-url";

const TOKEN_BYTES = 24;

/** Generate a new opaque punch QR token (store on shops.punch_qr_token). */
export function generatePunchQrToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Constant-time compare for stored vs request token. */
export function punchQrTokensMatch(stored: string | null | undefined, provided: string | null): boolean {
  if (!stored || !provided) return false;
  try {
    const a = Buffer.from(stored.trim(), "utf8");
    const b = Buffer.from(provided.trim(), "utf8");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Optional HMAC wrapper for token in URL (shopId-bound).
 * Uses PUNCH_QR_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY as fallback.
 */
export function signPunchQrPayload(shopId: string, token: string): string {
  const secret = process.env.PUNCH_QR_SIGNING_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return token;
  const sig = createHmac("sha256", secret).update(`${shopId}:${token}`).digest("base64url");
  return `${token}.${sig.slice(0, 16)}`;
}

export function verifySignedPunchQrPayload(shopId: string, payload: string, storedToken: string): boolean {
  const dot = payload.lastIndexOf(".");
  if (dot <= 0) return punchQrTokensMatch(storedToken, payload);
  const tokenPart = payload.slice(0, dot);
  const sigPart = payload.slice(dot + 1);
  const secret = process.env.PUNCH_QR_SIGNING_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return punchQrTokensMatch(storedToken, tokenPart);
  const expected = createHmac("sha256", secret).update(`${shopId}:${tokenPart}`).digest("base64url").slice(0, 16);
  if (expected.length !== sigPart.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sigPart)) && punchQrTokensMatch(storedToken, tokenPart);
  } catch {
    return false;
  }
}
