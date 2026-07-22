import { handleSelfieUploadRequest } from "@/lib/selfie-upload-handler";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Clock punch: upload selfie with service role before attendance insert. */
export async function POST(req: Request) {
  return handleSelfieUploadRequest(createAdminClient(), req);
}
