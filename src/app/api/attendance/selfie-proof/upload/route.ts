import { handleSelfieUploadRequest } from "@/lib/selfie-upload-handler";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** @deprecated Prefer POST /api/upload-selfie — same handler. */
export async function POST(req: Request) {
  return handleSelfieUploadRequest(createAdminClient(), req);
}
