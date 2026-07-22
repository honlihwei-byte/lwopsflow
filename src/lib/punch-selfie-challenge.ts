import { createHmac, randomInt, timingSafeEqual } from "crypto";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export type SelfieChallengePayload = {
  staffId: string;
  shopId: string;
  required: boolean;
  exp: number;
};

function secret(): string {
  return (
    process.env.PUNCH_SELFIE_CHALLENGE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-selfie-challenge-secret"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function rollRandomSelfieRequired(percent: number): boolean {
  const p = Math.max(0, Math.min(100, percent));
  if (p <= 0) return false;
  return randomInt(0, 100) < p;
}

export function issueSelfieChallenge(payload: Omit<SelfieChallengePayload, "exp">): {
  token: string;
  required: boolean;
  expiresAt: string;
} {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const body: SelfieChallengePayload = { ...payload, exp };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = sign(encoded);
  return {
    token: `${encoded}.${sig}`,
    required: payload.required,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifySelfieChallenge(
  token: string | null | undefined,
  staffId: string,
  shopId: string,
): SelfieChallengePayload | null {
  if (!token?.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = sign(encoded);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SelfieChallengePayload;
    if (payload.staffId !== staffId || payload.shopId !== shopId) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
