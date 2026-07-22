import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export const BUDDY_PUNCH_WINDOW_MS = 10 * 60 * 1000;
export const DIFFERENT_SHOP_WINDOW_MS = 30 * 60 * 1000;
export const MAX_TRUSTED_DEVICES_PER_STAFF = 3;

export type DeviceTrustResult = {
  deviceId: string | null;
  browserInfo: string | null;
  isNewDevice: boolean;
  deviceTrustStatus: "trusted" | "new_device" | null;
  approved: boolean | null;
};

export type StaffTrustedDeviceRow = {
  id: string;
  device_id: string;
  device_name: string | null;
  browser_info: string | null;
  os_name: string | null;
  approved: boolean;
  first_seen_at: string;
  last_seen_at: string;
};

async function activeTrustedDeviceCount(supabase: Supabase, staffId: string): Promise<number> {
  const { count } = await supabase
    .from("staff_trusted_devices")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .is("revoked_at", null);
  return count ?? 0;
}

export async function listStaffTrustedDevices(
  supabase: Supabase,
  staffId: string,
): Promise<StaffTrustedDeviceRow[]> {
  const { data, error } = await supabase
    .from("staff_trusted_devices")
    .select("id, device_id, device_name, browser_info, os_name, approved, first_seen_at, last_seen_at")
    .eq("staff_id", staffId)
    .is("revoked_at", null)
    .order("first_seen_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    device_id: String(row.device_id),
    device_name: row.device_name != null ? String(row.device_name) : null,
    browser_info: row.browser_info != null ? String(row.browser_info) : null,
    os_name: row.os_name != null ? String(row.os_name) : null,
    approved: row.approved === true,
    first_seen_at: String(row.first_seen_at),
    last_seen_at: String(row.last_seen_at),
  }));
}

export async function resolveDeviceTrust(
  supabase: Supabase,
  params: {
    staffId: string;
    companyId: string | null;
    deviceId: string | null;
    browserInfo: string | null;
    deviceName?: string | null;
    osName?: string | null;
    /** Logged-in employee punching as themselves — link device without new-device flag. */
    autoTrustVerifiedIdentity?: boolean;
  },
): Promise<DeviceTrustResult> {
  const { staffId, companyId, deviceId, browserInfo, autoTrustVerifiedIdentity } = params;
  if (!deviceId) {
    return {
      deviceId,
      browserInfo,
      isNewDevice: false,
      deviceTrustStatus: null,
      approved: null,
    };
  }

  const activeCount = await activeTrustedDeviceCount(supabase, staffId);

  if (deviceId === "unknown") {
    const isFirstDevice = activeCount === 0;
    return {
      deviceId,
      browserInfo,
      isNewDevice: !isFirstDevice,
      deviceTrustStatus: isFirstDevice ? "trusted" : "new_device",
      approved: isFirstDevice,
    };
  }

  const { data: existing } = await supabase
    .from("staff_trusted_devices")
    .select("id, approved, revoked_at")
    .eq("staff_id", staffId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing && !existing.revoked_at) {
    const shouldApprove = autoTrustVerifiedIdentity === true || existing.approved === true;
    await supabase
      .from("staff_trusted_devices")
      .update({
        last_seen_at: new Date().toISOString(),
        ...(shouldApprove ? { approved: true, approved_at: new Date().toISOString() } : {}),
        ...(browserInfo ? { browser_info: browserInfo.slice(0, 500) } : {}),
        ...(params.deviceName ? { device_name: params.deviceName.slice(0, 200) } : {}),
        ...(params.osName ? { os_name: params.osName.slice(0, 120) } : {}),
      })
      .eq("id", existing.id);

    const approved = shouldApprove;
    return {
      deviceId,
      browserInfo,
      isNewDevice: autoTrustVerifiedIdentity ? false : !approved,
      deviceTrustStatus: approved ? "trusted" : "new_device",
      approved,
    };
  }

  const isFirstDevice = activeCount === 0;
  const autoApprove =
    autoTrustVerifiedIdentity === true ||
    (isFirstDevice && activeCount < MAX_TRUSTED_DEVICES_PER_STAFF);

  const { error: insertErr } = await supabase.from("staff_trusted_devices").insert({
    staff_id: staffId,
    company_id: companyId,
    device_id: deviceId,
    browser_info: browserInfo?.slice(0, 500) ?? null,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    device_name: params.deviceName?.slice(0, 200) ?? null,
    os_name: params.osName?.slice(0, 120) ?? null,
    approved: autoApprove,
    approved_at: autoApprove ? new Date().toISOString() : null,
  });
  if (insertErr) {
    console.error("staff_trusted_devices insert failed", insertErr);
  }

  return {
    deviceId,
    browserInfo,
    isNewDevice: !autoApprove,
    deviceTrustStatus: autoApprove ? "trusted" : "new_device",
    approved: autoApprove,
  };
}

export async function detectBuddyPunchOnDevice(
  supabase: Supabase,
  params: {
    companyId: string | null;
    deviceId: string;
    staffId: string;
    windowMs?: number;
  },
): Promise<boolean> {
  const since = new Date(Date.now() - (params.windowMs ?? BUDDY_PUNCH_WINDOW_MS)).toISOString();

  let query = supabase
    .from("attendance")
    .select("staff_id")
    .eq("punch_device_id", params.deviceId)
    .neq("staff_id", params.staffId)
    .gte("created_at", since)
    .limit(1);

  if (params.companyId) {
    const { data: shopIds } = await supabase
      .from("shops")
      .select("id")
      .eq("company_id", params.companyId);
    const ids = (shopIds ?? []).map((s) => String(s.id));
    if (ids.length === 0) return false;
    query = query.in("shop_id", ids);
  }

  const { data } = await query;
  return (data ?? []).length > 0;
}

export async function detectDifferentShopShortTime(
  supabase: Supabase,
  params: {
    staffId: string;
    shopId: string;
    windowMs?: number;
  },
): Promise<boolean> {
  const since = new Date(Date.now() - (params.windowMs ?? DIFFERENT_SHOP_WINDOW_MS)).toISOString();

  const { data } = await supabase
    .from("attendance")
    .select("shop_id")
    .eq("staff_id", params.staffId)
    .neq("shop_id", params.shopId)
    .gte("created_at", since)
    .limit(1);

  return (data ?? []).length > 0;
}
