export function crushAlpha(a: number, low: number, high: number): number {
  if (a <= low) return 0;
  if (a >= high) return 1;
  const t = (a - low) / (high - low);
  return t * t * (3 - 2 * t);
}

function boxBlur1D(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  radius: number,
  horizontal: boolean,
) {
  const r = Math.max(1, radius | 0);
  const window = r * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let k = -r; k <= r; k++) {
        const x = k < 0 ? 0 : k >= w ? w - 1 : k;
        acc += src[row + x];
      }
      for (let x = 0; x < w; x++) {
        dst[row + x] = acc / window;
        const leave = x - r < 0 ? 0 : x - r;
        const enter = x + r + 1 >= w ? w - 1 : x + r + 1;
        acc += src[row + enter] - src[row + leave];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const y = k < 0 ? 0 : k >= h ? h - 1 : k;
        acc += src[y * w + x];
      }
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = acc / window;
        const leave = y - r < 0 ? 0 : y - r;
        const enter = y + r + 1 >= h ? h - 1 : y + r + 1;
        acc += src[enter * w + x] - src[leave * w + x];
      }
    }
  }
}

export function blurAlpha(alpha: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return alpha;
  const tmp = new Float32Array(alpha.length);
  const out = new Float32Array(alpha.length);
  boxBlur1D(alpha, tmp, w, h, radius, true);
  boxBlur1D(tmp, out, w, h, radius, false);
  boxBlur1D(out, tmp, w, h, radius, true);
  boxBlur1D(tmp, out, w, h, radius, false);
  return out;
}

export type Look = { threshold: number; feather: number };

export function applyLook(rgba: Uint8ClampedArray, w: number, h: number, look: Look): ImageData {
  const n = w * h;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rgba[i * 4 + 3] / 255;
  const t = Math.max(0, Math.min(100, look.threshold)) / 100;
  const low = 0.02 + t * 0.24;
  const high = 0.98 - t * 0.2;
  for (let i = 0; i < n; i++) a[i] = crushAlpha(a[i], low, high);
  const feather = Math.round(look.feather);
  const soft = feather > 0 ? blurAlpha(a, w, h, feather) : a;
  const out = new ImageData(w, h);
  const d = out.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    d[o] = rgba[o];
    d[o + 1] = rgba[o + 1];
    d[o + 2] = rgba[o + 2];
    d[o + 3] = Math.round(Math.max(0, Math.min(1, soft[i])) * 255);
  }
  return out;
}

export function checker(ctx: CanvasRenderingContext2D, w: number, h: number, size = 16) {
  ctx.fillStyle = "#d9d2c4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f0efec";
  const cols = Math.ceil(w / size);
  const rows = Math.ceil(h / size);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * size, y * size, size, size);
    }
  }
}
