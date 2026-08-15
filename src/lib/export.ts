import { zipSync } from "fflate";
import { applyLook, type Look } from "./compose";
import { paintBackdrop, type Backdrop } from "./backgrounds";

export type Shot = {
  name: string;
  width: number;
  height: number;
  original: ImageBitmap;
  rawRgba: Uint8ClampedArray;
};

function composeCanvas(
  shot: Shot,
  look: Look,
  bg: Backdrop,
  custom: ImageBitmap | null,
  withChecker: boolean,
): HTMLCanvasElement {
  const { width: w, height: h } = shot;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (withChecker && bg.kind === "transparent") {
    const size = Math.max(8, Math.round(Math.min(w, h) / 40));
    ctx.fillStyle = "#d9d2c4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f0efec";
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        if (((x / size) | 0) + ((y / size) | 0) & 1) ctx.fillRect(x, y, size, size);
      }
    }
  }
  paintBackdrop(ctx, w, h, bg, shot.original, custom);
  const matte = applyLook(shot.rawRgba, w, h, look);
  const overlay = document.createElement("canvas");
  overlay.width = w;
  overlay.height = h;
  overlay.getContext("2d")!.putImageData(matte, 0, 0);
  ctx.drawImage(overlay, 0, 0);
  return canvas;
}

export function renderPreview(
  canvas: HTMLCanvasElement,
  shot: Shot,
  look: Look,
  bg: Backdrop,
  custom: ImageBitmap | null,
) {
  const tmp = composeCanvas(shot, look, bg, custom, true);
  canvas.width = tmp.width;
  canvas.height = tmp.height;
  canvas.getContext("2d")!.drawImage(tmp, 0, 0);
}

export function renderOriginal(canvas: HTMLCanvasElement, shot: Shot) {
  canvas.width = shot.width;
  canvas.height = shot.height;
  canvas.getContext("2d")!.drawImage(shot.original, 0, 0);
}

export function exportCanvas(
  shot: Shot,
  look: Look,
  bg: Backdrop,
  custom: ImageBitmap | null,
): HTMLCanvasElement {
  return composeCanvas(shot, look, bg, custom, false);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/webp", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), type, quality);
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function stem(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "cutout";
}

export async function zipCutouts(
  shots: Shot[],
  look: Look,
  bg: Backdrop,
  custom: ImageBitmap | null,
  type: "image/png" | "image/webp",
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const ext = type === "image/webp" ? "webp" : "png";
  for (const shot of shots) {
    const canvas = exportCanvas(shot, look, bg, custom);
    const blob = await canvasToBlob(canvas, type);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let fname = `${stem(shot.name)}-cutout.${ext}`;
    let n = 2;
    while (files[fname]) {
      fname = `${stem(shot.name)}-cutout-${n}.${ext}`;
      n += 1;
    }
    files[fname] = buf;
  }
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
}
