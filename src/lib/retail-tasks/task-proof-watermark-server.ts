import sharp from "sharp";
import { formatMalaysiaWatermarkDate, malaysiaTimeHms } from "@/lib/malaysia-time";

export type TaskProofWatermarkLabels = {
  companyName: string;
  shopName: string;
  staffName: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildWatermarkSvg(
  imageWidth: number,
  lines: string[],
): { svg: Buffer; width: number; height: number } {
  const pad = Math.max(8, Math.round(imageWidth * 0.02));
  const fontSize = Math.max(11, Math.round(imageWidth * 0.028));
  const lineH = Math.max(14, Math.round(fontSize * 1.25));
  const maxChars = Math.max(...lines.map((line) => line.length), 8);
  const boxW = Math.min(
    imageWidth - pad * 2,
    Math.max(140, Math.round(maxChars * fontSize * 0.52)) + pad * 2,
  );
  const boxH = lines.length * lineH + pad * 2;

  const textRows = lines
    .map((line, index) => {
      const weight = index === 0 ? 700 : 500;
      const size = index === 0 ? fontSize + 1 : fontSize;
      const y = pad + size + index * lineH;
      return `<text x="${pad}" y="${y}" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `<svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" rx="4" fill="rgba(0,0,0,0.55)"/>
  ${textRows}
</svg>`;

  return { svg: Buffer.from(svg), width: boxW, height: boxH };
}

/** Apply bottom-right watermark using server timestamp (Malaysia date + time). */
export async function applyTaskProofWatermarkServer(
  input: Buffer,
  labels: TaskProofWatermarkLabels,
  capturedAt: Date,
): Promise<Buffer> {
  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1280;

  const lines = [
    "LW OpsFlow",
    labels.companyName,
    labels.shopName,
    labels.staffName,
    formatMalaysiaWatermarkDate(capturedAt),
    malaysiaTimeHms(capturedAt),
  ];

  const { svg } = buildWatermarkSvg(width, lines);

  return image
    .composite([{ input: svg, gravity: "southeast" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
