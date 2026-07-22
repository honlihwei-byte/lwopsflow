const STORAGE_PREFIX = "lwopsflow-shop-photo:";

/** Client-side shop photo cache until backend upload is wired. */
export function getShopPhotoUrl(shopId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${shopId}`);
  } catch {
    return null;
  }
}

export function setShopPhotoUrl(shopId: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${shopId}`, dataUrl);
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearShopPhotoUrl(shopId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${shopId}`);
  } catch {
    /* ignore */
  }
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
