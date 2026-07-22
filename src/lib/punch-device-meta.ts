import {
  getPunchBrowserInfo,
  getPunchDeviceName,
  getPunchOsName,
  getPunchPlatform,
  getPunchUserAgent,
} from "@/lib/punch-device-client";
import { getPunchDeviceId } from "@/lib/gps-indoor-trusted-device";

export type PunchDeviceMeta = {
  punch_device_id: string;
  device_fingerprint: string;
  punch_device_name: string;
  punch_browser_info: string;
  punch_browser: string;
  punch_platform: string;
  punch_user_agent: string;
  punch_os_name: string;
};

/** Collect device fields from the browser for attendance insert. */
export function collectPunchDeviceMetaFromClient(): PunchDeviceMeta {
  const deviceId = getPunchDeviceId();
  const browserInfo = getPunchBrowserInfo();
  const userAgent = getPunchUserAgent();
  return {
    punch_device_id: deviceId,
    device_fingerprint: deviceId,
    punch_device_name: getPunchDeviceName(),
    punch_browser_info: browserInfo,
    punch_browser: browserInfo.slice(0, 200),
    punch_platform: getPunchPlatform(),
    punch_user_agent: userAgent,
    punch_os_name: getPunchOsName(),
  };
}

export function punchDeviceMetaFromRequest(extras: {
  punch_device_id?: string | null;
  punch_browser_info?: string | null;
  punch_device_name?: string | null;
  punch_os_name?: string | null;
  punch_browser?: string | null;
  punch_platform?: string | null;
  punch_user_agent?: string | null;
}): PunchDeviceMeta {
  const deviceId = extras.punch_device_id?.trim() || "unknown";
  const browserInfo = extras.punch_browser_info?.trim() || "";
  return {
    punch_device_id: deviceId,
    device_fingerprint: deviceId,
    punch_device_name: extras.punch_device_name?.trim() || "unknown",
    punch_browser_info: browserInfo,
    punch_browser: (extras.punch_browser?.trim() || browserInfo).slice(0, 200),
    punch_platform: extras.punch_platform?.trim() || extras.punch_os_name?.trim() || "unknown",
    punch_user_agent: extras.punch_user_agent?.trim() || browserInfo.slice(0, 500),
    punch_os_name: extras.punch_os_name?.trim() || "unknown",
  };
}

export function deviceMetaToInsertFields(meta: PunchDeviceMeta): Record<string, string> {
  return {
    punch_device_id: meta.punch_device_id,
    device_fingerprint: meta.device_fingerprint,
    punch_device_name: meta.punch_device_name,
    punch_browser_info: meta.punch_browser_info,
    punch_browser: meta.punch_browser,
    punch_platform: meta.punch_platform,
    punch_user_agent: meta.punch_user_agent,
  };
}
