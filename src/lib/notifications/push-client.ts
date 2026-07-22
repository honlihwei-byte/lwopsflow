/** Register service worker and subscribe to Web Push (browser only). */

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Request permission, subscribe, save subscription, and enable notification prefs. */
export async function completePushOnboarding(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const result = await registerPushSubscription();
  if (!result.ok) return result;

  const res = await fetch("/api/employee/notification-preferences", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notifications_enabled: true,
      push_enabled: true,
    }),
  });
  if (!res.ok) return { ok: false, reason: "prefs_failed" };
  return { ok: true };
}

export async function registerPushSubscription(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, reason: "denied" };
  }

  const keyRes = await fetch("/api/employee/push-subscribe", { credentials: "include" });
  const keyJson = (await keyRes.json()) as { vapid_public_key?: string | null };
  const publicKey = keyJson.vapid_public_key;
  if (!publicKey) {
    return { ok: false, reason: "not_configured" };
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = sub.toJSON();
  const res = await fetch("/api/employee/push-subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }),
  });
  if (!res.ok) return { ok: false, reason: "save_failed" };
  return { ok: true };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
