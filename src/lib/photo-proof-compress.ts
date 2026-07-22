/** Client-side photo proof compression before upload. */

export const PHOTO_PROOF_MAX_DIMENSION = 1280;
export const PHOTO_PROOF_TARGET_MAX_BYTES = 300 * 1024;
export const PHOTO_PROOF_PREFERRED_MAX_BYTES = 250 * 1024;
export const PHOTO_PROOF_JPEG_QUALITY_HIGH = 0.75;
export const PHOTO_PROOF_JPEG_QUALITY_LOW = 0.65;

export type CompressedPhotoProof = {
  blob: Blob;
  file: File;
  width: number;
  height: number;
  originalFileSize: number;
  compressedFileSize: number;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
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
  maxHeight: number,
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
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
  for (let q = PHOTO_PROOF_JPEG_QUALITY_HIGH; q >= PHOTO_PROOF_JPEG_QUALITY_LOW - 0.001; q -= 0.05) {
    const blob = await canvasToJpegBlob(canvas, q);
    best = blob;
    if (blob.size <= maxBytes) return blob;
  }
  if (best) return best;
  throw new Error("Could not compress image.");
}

/**
 * Resize (max 1280×1280), JPEG compress (0.65–0.75), target under 300KB.
 * Never returns the original file bytes.
 */
export async function compressPhotoProofImage(file: File): Promise<CompressedPhotoProof> {
  const originalFileSize = file.size;
  const img = await loadImageFromFile(file);

  let { width, height } = scaledDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    PHOTO_PROOF_MAX_DIMENSION,
    PHOTO_PROOF_MAX_DIMENSION,
  );

  let blob = await encodeJpegAtSize(img, width, height, PHOTO_PROOF_TARGET_MAX_BYTES);

  while (blob.size > PHOTO_PROOF_TARGET_MAX_BYTES && width > 480 && height > 480) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    blob = await encodeJpegAtSize(img, width, height, PHOTO_PROOF_TARGET_MAX_BYTES);
  }

  const compressedFileSize = blob.size;
  const outFile = new File([blob], "proof.jpg", { type: "image/jpeg", lastModified: Date.now() });

  return {
    blob,
    file: outFile,
    width,
    height,
    originalFileSize,
    compressedFileSize,
  };
}
