/**
 * Generate favicon and PWA icons from public/images/lwopsflow-logo.png
 * Usage: node scripts/generate-brand-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "images", "lwopsflow-logo.png");
const publicDir = path.join(root, "public");

if (!fs.existsSync(source)) {
  console.error("Missing source logo:", source);
  process.exit(1);
}

const base = sharp(source).trim().png();

await base.clone().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(path.join(publicDir, "icon-512.png"));
await base.clone().resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(path.join(publicDir, "icon-192.png"));

// Open Graph / social preview (1200x630 with centered logo)
const ogWidth = 1200;
const ogHeight = 630;
const ogLogoWidth = 520;
const ogLogo = await base
  .clone()
  .resize(ogLogoWidth, ogLogoWidth, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp({
  create: {
    width: ogWidth,
    height: ogHeight,
    channels: 4,
    background: { r: 248, g: 250, b: 252, alpha: 1 },
  },
})
  .composite([{ input: ogLogo, gravity: "center" }])
  .png()
  .toFile(path.join(publicDir, "images", "lwopsflow-og.png"));

// favicon.ico — 32px PNG wrapped as ico (browsers accept PNG-in-ico or we use 32px png as favicon)
await base
  .clone()
  .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(publicDir, "favicon.ico"));

console.log("Generated: icon-512.png, icon-192.png, favicon.ico, images/lwopsflow-og.png");
