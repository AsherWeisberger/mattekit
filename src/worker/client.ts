export type WorkerProgress = {
  phase: "download" | "session" | "cut";
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  pct?: number;
};

type Handlers = {
  onProgress: (p: WorkerProgress) => void;
  onReady: (cached: boolean) => void;
  onResult: (id: string, width: number, height: number, rgba: Uint8ClampedArray) => void;
  onError: (message: string, id?: string) => void;
};

export function createCutter(handlers: Handlers) {
  const worker = new Worker(new URL("./cutout.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress") handlers.onProgress(m);
    else if (m.type === "ready") handlers.onReady(m.cached);
    else if (m.type === "result") {
      handlers.onResult(m.id, m.width, m.height, new Uint8ClampedArray(m.rgba));
    } else if (m.type === "error") handlers.onError(m.message, m.id);
  };
  worker.onerror = (e) => handlers.onError(e.message || "Worker failed");
  return {
    init() {
      worker.postMessage({ type: "init" });
    },
    cut(id: string, bitmap: ImageBitmap) {
      worker.postMessage({ type: "cut", id, bitmap }, [bitmap]);
    },
    terminate() {
      worker.terminate();
    },
  };
}
