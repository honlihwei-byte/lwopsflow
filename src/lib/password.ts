import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored?.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const salt = parts[1]!;
  const expectedHex = parts[2]!;
  try {
    const derived = scryptSync(password, salt, KEYLEN);
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}
