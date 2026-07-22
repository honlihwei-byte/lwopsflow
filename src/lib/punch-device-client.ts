/** Client-side browser fingerprint summary for punch audit. */
export function getPunchBrowserInfo(): string {
  if (typeof navigator === "undefined") return "unknown";
  const parts = [
    navigator.userAgent?.slice(0, 200) ?? "",
    navigator.language ?? "",
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "",
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 500);
}

export function getPunchOsName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent ?? "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "unknown";
}

export function getPunchDeviceName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform || navigator.platform || "";
  const os = getPunchOsName();
  const label = [os, platform].filter(Boolean).join(" / ");
  return (label || "unknown").slice(0, 200);
}

export function getPunchUserAgent(): string {
  if (typeof navigator === "undefined") return "unknown";
  return (navigator.userAgent ?? "unknown").slice(0, 500);
}

export function getPunchPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) return String(uaData.platform).slice(0, 120);
  return (navigator.platform || getPunchOsName()).slice(0, 120);
}
