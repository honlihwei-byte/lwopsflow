/** Burn LW OpsFlow watermark — bottom-right corner. */

export type TaskProofOverlayLines = {
  companyName: string;
  shopName: string;
  staffName: string;
  dateTime: string;
  gpsLabel?: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export async function applyTaskProofOverlay(
  file: File,
  lines: TaskProofOverlayLines,
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.drawImage(img, 0, 0);
    const w = canvas.width;
    const h = canvas.height;
    const pad = Math.max(8, Math.round(w * 0.02));
    const fontSize = Math.max(11, Math.round(w * 0.028));
    const lineH = Math.max(14, Math.round(fontSize * 1.25));

    const rows = [
      "LW OpsFlow",
      lines.companyName,
      lines.shopName,
      lines.staffName,
      lines.dateTime,
      ...(lines.gpsLabel ? [lines.gpsLabel] : []),
    ];

    const maxTextW = Math.max(
      ...rows.map((text) => {
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        return ctx.measureText(text).width;
      }),
    );
    const boxW = maxTextW + pad * 2;
    const boxH = rows.length * lineH + pad * 2;
    const boxX = w - boxW - pad;
    const boxY = h - boxH - pad;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    rows.forEach((text, i) => {
      ctx.font =
        i === 0
          ? `700 ${fontSize + 1}px system-ui, sans-serif`
          : `500 ${fontSize}px system-ui, sans-serif`;
      ctx.fillText(text, boxX + pad, boxY + pad + i * lineH);
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
        "image/jpeg",
        0.88,
      );
    });

    return new File([blob], file.name.replace(/\.\w+$/, "") + "-task-proof.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
