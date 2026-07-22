import type { PostgrestError } from "@supabase/supabase-js";

export type ApiErrorBody = {
  error: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function bodyFromPostgrest(err: PostgrestError): ApiErrorBody {
  return {
    error: err.message || "Database error",
    code: err.code,
    details: err.details ?? undefined,
    hint: err.hint ?? undefined,
  };
}

export function bodyFromCaught(e: unknown): ApiErrorBody {
  if (e instanceof Error) return { error: e.message };
  return { error: "Server error" };
}
