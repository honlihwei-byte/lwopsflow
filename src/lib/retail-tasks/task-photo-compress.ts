/** Task proof compression — max 1280px, JPEG ~70%, target under 500KB. */

export const TASK_PHOTO_MAX_DIMENSION = 1280;
export const TASK_PHOTO_TARGET_MAX_BYTES = 500 * 1024;
export const TASK_PHOTO_JPEG_QUALITY = 0.7;
export const TASK_PHOTO_JPEG_QUALITY_MIN = 0.55;

export type CompressedTaskPhoto = {
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
  max: number,
): { width: number; height: number } {
  if (width <= max && height <= max) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image."))),
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
  for (let q = TASK_PHOTO_JPEG_QUALITY; q >= TASK_PHOTO_JPEG_QUALITY_MIN - 0.001; q -= 0.05) {
    const blob = await canvasToJpegBlob(canvas, q);
    best = blob;
    if (blob.size <= maxBytes) return blob;
  }
  if (best) return best;
  throw new Error("Could not compress image.");
}

export async function compressTaskProofImage(file: File): Promise<CompressedTaskPhoto> {
  const originalFileSize = file.size;
  const img = await loadImageFromFile(file);
  let { width, height } = scaledDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    TASK_PHOTO_MAX_DIMENSION,
  );

  let blob = await encodeJpegAtSize(img, width, height, TASK_PHOTO_TARGET_MAX_BYTES);
  while (blob.size > TASK_PHOTO_TARGET_MAX_BYTES && width > 480 && height > 480) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    blob = await encodeJpegAtSize(img, width, height, TASK_PHOTO_TARGET_MAX_BYTES);
  }

  const outFile = new File([blob], "task-proof.jpg", { type: "image/jpeg", lastModified: Date.now() });
  return {
    blob,
    file: outFile,
    width,
    height,
    originalFileSize,
    compressedFileSize: blob.size,
  };
}
