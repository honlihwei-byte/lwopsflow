"use client";

import QRCode from "react-qr-code";
import { useCallback, useMemo, useRef } from "react";
import {
  buildShopClockQrFilenameBase,
  sanitizeFilenamePart,
  splitShopCodeAndName,
} from "@/lib/qr-download-filename";

export type QrPrintLabels = {
  brand?: string;
  shopCode?: string;
  shopName?: string;
  actionLine?: string;
};

type QrCodePanelProps = {
  value: string;
  /** Pixel size of the QR module grid (library default). */
  size?: number;
  /** Used for download filenames (no extension). Overrides shop clock naming when set. */
  filenameBase?: string;
  /** Shop clock QR: builds `{shop_code}-{shop_name}-Clock-QR` when filenameBase is omitted. */
  shopCode?: string | null;
  shopName?: string;
  /** Optional heading for print window title. */
  printTitle?: string;
  /** Shop clock print layout (LW OpsFlow header). */
  printLabels?: QrPrintLabels;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function resolveFilenameBase(props: {
  filenameBase?: string;
  shopCode?: string | null;
  shopName?: string;
}): string {
  if (props.filenameBase?.trim()) {
    return sanitizeFilenamePart(props.filenameBase);
  }
  if (props.shopName?.trim()) {
    return buildShopClockQrFilenameBase({
      shopCode: props.shopCode,
      shopName: props.shopName,
    });
  }
  return "Clock-QR";
}

/** Layout for a labeled QR raster/vector at the given on-screen size. */
function qrLabelLayout(size: number) {
  const scale = 4;
  const qrPx = size * scale;
  const sideMargin = Math.round(qrPx * 0.14);
  const topMargin = Math.round(qrPx * 0.14);
  const gap = Math.round(qrPx * 0.1);
  const bottomMargin = Math.round(qrPx * 0.16);
  const fontSize = Math.round(qrPx * 0.095);
  const lineHeight = Math.round(fontSize * 1.25);
  const width = qrPx + sideMargin * 2;
  const font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  return { qrPx, sideMargin, topMargin, gap, bottomMargin, fontSize, lineHeight, width, font };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return text ? [text] : [];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

function measureLabelLines(text: string, maxWidth: number, font: string): string[] {
  if (!text) return [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [text];
  ctx.font = font;
  return wrapText(ctx, text, maxWidth);
}

export function QrCodePanel({
  value,
  size = 200,
  filenameBase,
  shopCode,
  shopName,
  printTitle,
  printLabels,
}: QrCodePanelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const resolvedFilenameBase = useMemo(
    () => resolveFilenameBase({ filenameBase, shopCode, shopName }),
    [filenameBase, shopCode, shopName],
  );

  const resolvedPrintLabels = useMemo((): QrPrintLabels | null => {
    if (printLabels) return printLabels;
    if (!shopName?.trim()) return null;
    const { code, name } = splitShopCodeAndName(shopName, shopCode);
    return {
      brand: "LW OpsFlow",
      shopCode: code,
      shopName: name,
      actionLine: "Clock In / Clock Out",
    };
  }, [printLabels, shopCode, shopName]);

  /** Single-line shop label embedded into downloads/print, e.g. "TT10 - Tataa & Friend's". */
  const labelText = useMemo(() => {
    if (resolvedPrintLabels) {
      const code = resolvedPrintLabels.shopCode?.trim();
      const name = resolvedPrintLabels.shopName?.trim() ?? "";
      return code ? `${code} - ${name}`.trim() : name;
    }
    return shopName?.trim() ?? "";
  }, [resolvedPrintLabels, shopName]);

  const hasLabel = Boolean(labelText);

  const getSvg = () => wrapRef.current?.querySelector("svg");

  /** QR-only PNG (used for staff ID cards with no shop label). */
  const downloadPng = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const scale = 2;
    const px = size * scale;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) => {
          if (!b) return;
          const a = document.createElement("a");
          const u = URL.createObjectURL(b);
          a.href = u;
          a.download = `${resolvedFilenameBase}.png`;
          a.click();
          URL.revokeObjectURL(u);
        },
        "image/png",
        1,
      );
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [resolvedFilenameBase, size]);

  /** Labeled JPG: QR centered on white with bold shop label below. */
  const downloadJpg = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const layout = qrLabelLayout(size);
    const lines = measureLabelLines(labelText, layout.qrPx, layout.font);
    const labelBlockHeight = lines.length * layout.lineHeight;
    const height =
      layout.topMargin + layout.qrPx + layout.gap + labelBlockHeight + layout.bottomMargin;

    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layout.width, height);

    const img = new Image();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, layout.sideMargin, layout.topMargin, layout.qrPx, layout.qrPx);
      URL.revokeObjectURL(url);

      ctx.fillStyle = "#000000";
      ctx.font = layout.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      let y = layout.topMargin + layout.qrPx + layout.gap;
      for (const line of lines) {
        ctx.fillText(line, layout.width / 2, y);
        y += layout.lineHeight;
      }

      canvas.toBlob(
        (b) => {
          if (!b) return;
          const a = document.createElement("a");
          const u = URL.createObjectURL(b);
          a.href = u;
          a.download = `${resolvedFilenameBase}.jpg`;
          a.click();
          URL.revokeObjectURL(u);
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [labelText, resolvedFilenameBase, size]);

  const downloadSvg = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;

    if (!hasLabel) {
      const data = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resolvedFilenameBase}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const layout = qrLabelLayout(size);
    const lines = measureLabelLines(labelText, layout.qrPx, layout.font);
    const labelBlockHeight = lines.length * layout.lineHeight;
    const height =
      layout.topMargin + layout.qrPx + layout.gap + labelBlockHeight + layout.bottomMargin;

    const viewBox = svg.getAttribute("viewBox") ?? `0 0 ${size} ${size}`;
    const vbParts = viewBox.split(/\s+/).map(Number);
    const vbW = vbParts[2] && vbParts[2] > 0 ? vbParts[2] : size;
    const qrScale = layout.qrPx / vbW;
    const innerContent = svg.innerHTML;

    const firstBaseline = layout.topMargin + layout.qrPx + layout.gap + layout.fontSize;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${layout.width / 2}" dy="${i === 0 ? 0 : layout.lineHeight}">${escapeHtml(line)}</tspan>`,
      )
      .join("");

    const wrapped =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}" viewBox="0 0 ${layout.width} ${height}">` +
      `<rect x="0" y="0" width="${layout.width}" height="${height}" fill="#ffffff"/>` +
      `<g transform="translate(${layout.sideMargin} ${layout.topMargin}) scale(${qrScale})">${innerContent}</g>` +
      `<text x="${layout.width / 2}" y="${firstBaseline}" text-anchor="middle" fill="#000000" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="${layout.fontSize}">${tspans}</text>` +
      `</svg>`;

    const blob = new Blob([wrapped], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resolvedFilenameBase}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [hasLabel, labelText, resolvedFilenameBase, size]);

  const printQr = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const w = window.open("", "_blank", "width=480,height=620");
    if (!w) return;

    const title = escapeHtml(
      printTitle || (labelText ? labelText : "Clock QR"),
    );

    const brand = resolvedPrintLabels?.brand ?? (hasLabel ? "LW OpsFlow" : "");
    const actionLine =
      resolvedPrintLabels?.actionLine ?? (hasLabel ? "Clock In / Clock Out" : "");

    const brandHtml = brand
      ? `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#111827">${escapeHtml(brand)}</p>`
      : "";
    const labelHtml = labelText
      ? `<p style="margin:20px 24px 6px;font-size:26px;font-weight:800;line-height:1.2;color:#000">${escapeHtml(labelText)}</p>`
      : "";
    const actionHtml = actionLine
      ? `<p style="margin:0;font-size:15px;color:#374151">${escapeHtml(actionLine)}</p>`
      : "";

    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>` +
        `<style>@page{margin:16mm}body{margin:0}svg{width:300px;height:300px}</style>` +
        `</head><body style="padding:40px 32px;text-align:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">` +
        `<div style="display:inline-block;padding:28px 28px 32px;background:#fff">` +
        `${brandHtml}<div style="margin:0 auto;width:300px;height:300px">${svgStr}</div>${labelHtml}${actionHtml}` +
        `</div>` +
        `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)})<\/script>` +
        `</body></html>`,
    );
    w.document.close();
  }, [printTitle, labelText, hasLabel, resolvedPrintLabels]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapRef}
        className="inline-block rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700"
      >
        <QRCode value={value} size={size} level="M" bgColor="#ffffff" fgColor="#000000" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={hasLabel ? downloadJpg : downloadPng}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900"
        >
          Download QR
        </button>
        <button
          type="button"
          onClick={downloadSvg}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-600"
        >
          Download SVG
        </button>
        <button
          type="button"
          onClick={printQr}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-600"
        >
          Print QR
        </button>
      </div>
    </div>
  );
}
