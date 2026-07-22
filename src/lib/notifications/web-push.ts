import webpush from "web-push";
import { listPushSubscriptionsForStaff } from "@/lib/notifications/ops-notifications-db";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

let vapidConfigured = false;

function ensureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@opsflow.app";
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export type VapidAuditStatus = {
  public_key_loaded: boolean;
  private_key_loaded: boolean;
  subject_loaded: boolean;
  subject: string;
  push_available: boolean;
  public_key_preview: string | null;
};

export function getVapidAuditStatus(): VapidAuditStatus {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@opsflow.app";
  const subjectExplicit = Boolean(process.env.VAPID_SUBJECT?.trim());
  return {
    public_key_loaded: publicKey.length > 0,
    private_key_loaded: privateKey.length > 0,
    subject_loaded: subjectExplicit,
    subject,
    push_available: publicKey.length > 0 && privateKey.length > 0,
    public_key_preview: publicKey ? `${publicKey.slice(0, 8)}…${publicKey.slice(-6)}` : null,
  };
}

export async function checkPushSubscriptionsTable(
  supabase: Supabase,
): Promise<{ exists: boolean; error?: string }> {
  const { error } = await supabase.from("staff_push_subscriptions").select("id").limit(1);
  if (!error) return { exists: true };
  const msg = error.message.toLowerCase();
  if (msg.includes("does not exist") || msg.includes("schema cache")) {
    return { exists: false, error: error.message };
  }
  return { exists: true };
}

export type PushSubscriptionDelivery = {
  endpoint_preview: string;
  accepted_by_push_service: boolean;
  status_code: number | null;
  error: string | null;
  error_body: string | null;
};

export type PushSendReport = {
  sent: number;
  failed: number;
  deliveries: PushSubscriptionDelivery[];
};

function endpointPreview(endpoint: string): string {
  if (endpoint.length <= 48) return endpoint;
  return `${endpoint.slice(0, 32)}…${endpoint.slice(-12)}`;
}

function parseWebPushError(e: unknown): {
  message: string;
  status_code: number | null;
  body: string | null;
} {
  if (e && typeof e === "object") {
    const err = e as { message?: string; statusCode?: number; body?: string };
    return {
      message: err.message ?? "Push send failed",
      status_code: typeof err.statusCode === "number" ? err.statusCode : null,
      body: typeof err.body === "string" ? err.body : null,
    };
  }
  return {
    message: e instanceof Error ? e.message : "Push send failed",
    status_code: null,
    body: null,
  };
}

export async function sendBrowserPushToStaff(
  supabase: Supabase,
  params: {
    staff_id: string;
    title: string;
    body: string;
    url?: string;
  },
  options?: { detailed?: boolean },
): Promise<PushSendReport> {
  const empty: PushSendReport = { sent: 0, failed: 0, deliveries: [] };
  if (!ensureVapid()) return empty;

  const subs = await listPushSubscriptionsForStaff(supabase, params.staff_id);
  if (subs.length === 0) return empty;

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url ?? "/employee/notifications",
  });

  let sent = 0;
  let failed = 0;
  const deliveries: PushSubscriptionDelivery[] = [];

  for (const sub of subs) {
    const preview = endpointPreview(sub.endpoint);
    try {
      const result = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      sent++;
      if (options?.detailed) {
        deliveries.push({
          endpoint_preview: preview,
          accepted_by_push_service: true,
          status_code: result.statusCode,
          error: null,
          error_body: null,
        });
      }
    } catch (e) {
      failed++;
      const parsed = parseWebPushError(e);
      console.warn("[web-push] send failed", parsed.message, parsed.status_code ?? "");
      if (options?.detailed) {
        deliveries.push({
          endpoint_preview: preview,
          accepted_by_push_service: false,
          status_code: parsed.status_code,
          error: parsed.message,
          error_body: parsed.body,
        });
      }
    }
  }
  return { sent, failed, deliveries };
}
