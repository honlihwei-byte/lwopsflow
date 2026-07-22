/** Burn staff/shop/time/action overlay onto selfie image (client-side). */

export type SelfieOverlayLines = {
  staffName: string;
  shopName: string;
  dateTime: string;
  actionLabel: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export async function applySelfieProofOverlay(
  file: File,
  lines: SelfieOverlayLines,
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
    const h = canvas.height;
    const w = canvas.width;
    const barH = Math.max(72, Math.round(h * 0.22));
    const gradient = ctx.createLinearGradient(0, h - barH, 0, h);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h - barH, w, barH);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const pad = Math.max(12, Math.round(w * 0.03));
    const fontSize = Math.max(14, Math.round(w * 0.045));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const smallSize = Math.max(11, Math.round(fontSize * 0.82));
    const rows = [
      lines.staffName,
      lines.shopName,
      lines.dateTime,
      lines.actionLabel,
    ];
    let y = h - pad;
    for (let i = rows.length - 1; i >= 0; i--) {
      ctx.font =
        i === 0
          ? `700 ${fontSize}px system-ui, sans-serif`
          : `500 ${smallSize}px system-ui, sans-serif`;
      ctx.fillText(rows[i]!, pad, y);
      y -= i === 0 ? fontSize + 4 : smallSize + 3;
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
        "image/jpeg",
        0.88,
      );
    });

    return new File([blob], file.name.replace(/\.\w+$/, "") + "-selfie.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
