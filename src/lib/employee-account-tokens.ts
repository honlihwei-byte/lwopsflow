import { createHash, randomBytes } from "crypto";
import {
  getEmployeeActivateUrl,
  getEmployeeAppBaseUrl,
} from "@/lib/app-url";

export const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generateAccountToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccountToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function activationExpiresAt(from = Date.now()): string {
  return new Date(from + ACTIVATION_TOKEN_TTL_MS).toISOString();
}

export function resetExpiresAt(from = Date.now()): string {
  return new Date(from + RESET_TOKEN_TTL_MS).toISOString();
}

/** Canonical employee activation URL — always uses production app domain. */
export function buildActivationUrl(rawToken: string): string {
  return getEmployeeActivateUrl(rawToken);
}

/** Password reset link (future self-service / OTP). */
export function buildResetUrl(rawToken: string): string {
  const base = getEmployeeAppBaseUrl();
  return `${base}/reset-password/${encodeURIComponent(rawToken)}`;
}

/** @deprecated Use getEmployeeAppBaseUrl from @/lib/app-url */
export function requestOrigin(_req?: Request): string {
  return getEmployeeAppBaseUrl();
}
