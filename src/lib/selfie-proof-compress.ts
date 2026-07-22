/** Client-side selfie compression before upload (clock punch). */

export const SELFIE_MAX_WIDTH = 720;
export const SELFIE_TARGET_MAX_BYTES = 200 * 1024;
export const SELFIE_JPEG_QUALITY_HIGH = 0.7;
export const SELFIE_JPEG_QUALITY_LOW = 0.6;

export type CompressedSelfieProof = {
  blob: Blob;
  file: File;
  width: number;
  height: number;
  originalFileSize: number;
  compressedFileSize: number;
};

function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    img.src = url;
  });
}

function scaledDimensions(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = maxWidth / width;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function encodeJpegAtSize(
  img: HTMLImageElement,
  width: number,
  height: number,
  maxBytes: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(img, 0, 0, width, height);

  let best: Blob | null = null;
  for (let q = SELFIE_JPEG_QUALITY_HIGH; q >= SELFIE_JPEG_QUALITY_LOW - 0.001; q -= 0.05) {
    const blob = await canvasToJpegBlob(canvas, q);
    best = blob;
    if (blob.size <= maxBytes) return blob;
  }
  if (best) return best;
  throw new Error("Could not compress image.");
}

/** Resize max width 720px, JPEG 0.6–0.7, target under 200KB. */
export async function compressSelfieProofImage(
  file: File | Blob,
): Promise<CompressedSelfieProof> {
  const originalFileSize = file instanceof File ? file.size : file.size;
  const img = await loadImageFromFile(file);

  let { width, height } = scaledDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    SELFIE_MAX_WIDTH,
  );

  let blob = await encodeJpegAtSize(img, width, height, SELFIE_TARGET_MAX_BYTES);

  while (blob.size > SELFIE_TARGET_MAX_BYTES && width > 400) {
    width = Math.round(width * 0.85);
    height = Math.max(1, Math.round(height * 0.85));
    blob = await encodeJpegAtSize(img, width, height, SELFIE_TARGET_MAX_BYTES);
  }

  const compressedFileSize = blob.size;
  const outFile = new File([blob], "selfie.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return {
    blob,
    file: outFile,
    width,
    height,
    originalFileSize,
    compressedFileSize,
  };
}
