import { env, pipeline, RawImage } from "@huggingface/transformers";
import { idbGet, idbPut } from "../lib/idb";

type ProgressMsg = {
  type: "progress";
  phase: "download" | "session" | "cut";
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  pct?: number;
};

type OutMsg =
  | ProgressMsg
  | { type: "ready"; cached: boolean }
  | { type: "result"; id: string; width: number; height: number; rgba: ArrayBuffer }
  | { type: "error"; id?: string; message: string };

const MODEL_ID = "onnx-community/ormbg-ONNX";
const DTYPE = "q8" as const;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
env.useFS = false;
env.useFSCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

env.customCache = {
  async match(request: RequestInfo | URL) {
    const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    const buf = await idbGet(url);
    if (!buf) return undefined;
    return new Response(buf, {
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(buf.byteLength) },
    });
  },
  async put(request: RequestInfo | URL, response: Response) {
    const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    const clone = response.clone();
    const buf = await clone.arrayBuffer();
    if (buf.byteLength > 0) await idbPut(url, buf);
  },
};

// @ts-expect-error transformers.js accepts a Cache-like customCache
env.useCustomCache = true;

let segmenter: Awaited<ReturnType<typeof pipeline>> | null = null;
let loading: Promise<void> | null = null;
let cachedHit = false;

function post(msg: OutMsg, transfer?: Transferable[]) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer || []);
}

async function ensureModel() {
  if (segmenter) return;
  if (loading) return loading;
  loading = (async () => {
    post({ type: "progress", phase: "download", status: "Preparing the cutout model…" });
    const probe = `https://huggingface.co/${MODEL_ID}/resolve/main/onnx/model_quantized.onnx`;
    cachedHit = !!(await idbGet(probe));
    // @ts-expect-error pipeline generic
    segmenter = await pipeline("background-removal", MODEL_ID, {
      dtype: DTYPE,
      device: "wasm",
      progress_callback: (p: {
        status?: string;
        name?: string;
        file?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      }) => {
        const file = p.file || p.name || "";
        const isOnnx = /onnx|model/i.test(file);
        const loaded = p.loaded ?? 0;
        const total = p.total ?? 0;
        const pct = total ? Math.round((loaded / total) * 100) : Math.round(p.progress ?? 0);
        if (p.status === "progress" || p.status === "download") {
          post({
            type: "progress",
            phase: "download",
            status: cachedHit ? "Reading cached model…" : "Downloading model…",
            file,
            loaded: isOnnx ? loaded : undefined,
            total: isOnnx ? total : undefined,
            pct,
          });
        } else if (p.status === "done" || p.status === "ready") {
          post({ type: "progress", phase: "session", status: "Starting the cutout session…" });
        }
      },
    });
    post({ type: "ready", cached: cachedHit });
  })();
  try {
    await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

async function cut(id: string, bitmap: ImageBitmap) {
  await ensureModel();
  if (!segmenter) throw new Error("Model failed to load");
  post({ type: "progress", phase: "cut", status: "Cutting the subject…" });
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const image = await RawImage.fromBlob(blob);
  // @ts-expect-error background-removal pipeline
  const out = await segmenter(image);
  const raw = (Array.isArray(out) ? out[0] : out) as {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
    toCanvas?: () => OffscreenCanvas | HTMLCanvasElement;
  };
  const dst = new OffscreenCanvas(w, h);
  const dctx = dst.getContext("2d")!;
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = "high";
  if (typeof raw.toCanvas === "function") {
    dctx.drawImage(raw.toCanvas() as CanvasImageSource, 0, 0, w, h);
  } else {
    const rw = raw.width;
    const rh = raw.height;
    const src = new OffscreenCanvas(rw, rh);
    const sctx = src.getContext("2d")!;
    const img = new ImageData(new Uint8ClampedArray(raw.data), rw, rh);
    sctx.putImageData(img, 0, 0);
    dctx.drawImage(src, 0, 0, w, h);
  }
  const rgba = dctx.getImageData(0, 0, w, h).data;
  const copy = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength);
  post({ type: "result", id, width: w, height: h, rgba: copy }, [copy]);
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data as
    | { type: "init" }
    | { type: "cut"; id: string; bitmap: ImageBitmap };
  try {
    if (data.type === "init") {
      await ensureModel();
      return;
    }
    if (data.type === "cut") {
      await cut(data.id, data.bitmap);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", id: data.type === "cut" ? data.id : undefined, message });
  }
};
