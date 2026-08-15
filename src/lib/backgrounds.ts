export type BgKind = "transparent" | "solid" | "gradient" | "blur" | "image";

export type Backdrop = {
  id: string;
  label: string;
  kind: BgKind;
  colors?: string[];
  angle?: number;
  color?: string;
  blur?: number;
};

export const BACKDROPS: Backdrop[] = [
  { id: "clear", label: "Clear", kind: "transparent" },
  { id: "blur", label: "Blur", kind: "blur", blur: 28 },
  { id: "paper", label: "Paper", kind: "solid", color: "#F0EFEC" },
  { id: "sand", label: "Sand", kind: "solid", color: "#D9CCAC" },
  { id: "steel", label: "Steel", kind: "solid", color: "#575860" },
  { id: "void", label: "Void", kind: "solid", color: "#0D0F14" },
  { id: "white", label: "White", kind: "solid", color: "#FFFFFF" },
  { id: "fog", label: "Fog", kind: "solid", color: "#8C9297" },
  {
    id: "tungsten",
    label: "Tungsten",
    kind: "gradient",
    colors: ["#6B3A18", "#2A160E", "#0E0907"],
    angle: 158,
  },
  {
    id: "daylight",
    label: "Daylight",
    kind: "gradient",
    colors: ["#2A4458", "#142030", "#0A1018"],
    angle: 168,
  },
  {
    id: "cyc",
    label: "Cyc",
    kind: "gradient",
    colors: ["#F2EDE4", "#D5CFC4", "#B7B0A4"],
    angle: 180,
  },
  {
    id: "sage",
    label: "Sage",
    kind: "gradient",
    colors: ["#2A4338", "#15241E", "#0A1410"],
    angle: 162,
  },
  {
    id: "wine",
    label: "Wine",
    kind: "gradient",
    colors: ["#5A2434", "#2A121C", "#12080C"],
    angle: 154,
  },
  {
    id: "dusk",
    label: "Dusk",
    kind: "gradient",
    colors: ["#3A2A58", "#1C1634", "#0C0A18"],
    angle: 150,
  },
  {
    id: "goldhour",
    label: "Gold hour",
    kind: "gradient",
    colors: ["#C4843A", "#6A3A18", "#24140C"],
    angle: 148,
  },
  {
    id: "ice",
    label: "Ice",
    kind: "gradient",
    colors: ["#E8EEF2", "#C5D0D8", "#9AA8B4"],
    angle: 172,
  },
  {
    id: "inkwell",
    label: "Inkwell",
    kind: "gradient",
    colors: ["#1A2040", "#0E1224", "#07080E"],
    angle: 170,
  },
  {
    id: "blush",
    label: "Blush",
    kind: "gradient",
    colors: ["#E8D0C4", "#C4A090", "#8A6A5C"],
    angle: 164,
  },
];

export function swatchCss(bg: Backdrop): string {
  if (bg.kind === "transparent") {
    return "repeating-conic-gradient(#cfc9bc 0% 25%, #f0efec 0% 50%) 0 0 / 14px 14px";
  }
  if (bg.kind === "blur") {
    return "linear-gradient(135deg, #575860, #0D0F14)";
  }
  if (bg.kind === "solid") return bg.color || "#111";
  const cols = bg.colors || ["#111", "#000"];
  const ang = bg.angle ?? 160;
  return `linear-gradient(${ang}deg, ${cols.join(", ")})`;
}

export function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
) {
  const iw = (img as ImageBitmap).width || (img as HTMLImageElement).naturalWidth || w;
  const ih = (img as ImageBitmap).height || (img as HTMLImageElement).naturalHeight || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function paintBackdrop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  bg: Backdrop,
  original?: CanvasImageSource | null,
  custom?: CanvasImageSource | null,
) {
  if (bg.kind === "transparent") {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  if (bg.kind === "solid") {
    ctx.fillStyle = bg.color || "#000";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.kind === "gradient") {
    const cols = bg.colors || ["#222", "#000"];
    const ang = ((bg.angle ?? 160) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(
      cx - Math.cos(ang) * len,
      cy - Math.sin(ang) * len,
      cx + Math.cos(ang) * len,
      cy + Math.sin(ang) * len,
    );
    cols.forEach((c, i) => g.addColorStop(i / Math.max(1, cols.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rg = ctx.createRadialGradient(
      cx,
      cy * 0.78,
      Math.min(w, h) * 0.12,
      cx,
      cy,
      Math.hypot(w, h) * 0.64,
    );
    const light = luma(cols[0]) > 0.55;
    rg.addColorStop(0, light ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)");
    rg.addColorStop(0.55, "rgba(0,0,0,0)");
    rg.addColorStop(1, light ? "rgba(40,32,24,0.22)" : "rgba(0,0,0,0.38)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.kind === "blur" && original) {
    ctx.save();
    ctx.filter = `blur(${bg.blur ?? 28}px)`;
    drawCover(ctx, original, w, h);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(8,10,14,0.18)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  if (bg.kind === "image" && custom) {
    drawCover(ctx, custom, w, h);
    return;
  }
  ctx.fillStyle = "#0D0F14";
  ctx.fillRect(0, 0, w, h);
}

function luma(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
