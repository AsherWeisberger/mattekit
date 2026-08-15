import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BACKDROPS, swatchCss, type Backdrop } from "./lib/backgrounds";
import {
  canvasToBlob,
  downloadBlob,
  exportCanvas,
  renderOriginal,
  renderPreview,
  stem,
  zipCutouts,
  type Shot,
} from "./lib/export";
import { createCutter, type WorkerProgress } from "./worker/client";

const MAX = 8;

type Status = "queued" | "cutting" | "ready" | "error";

type Item = {
  id: string;
  name: string;
  original: ImageBitmap;
  width: number;
  height: number;
  rawRgba: Uint8ClampedArray | null;
  status: Status;
  error?: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file);
  const max = 2048;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (s >= 1) return bmp;
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return c.transferToImageBitmap();
}

function toShot(item: Item): Shot | null {
  if (!item.rawRgba) return null;
  return {
    name: item.name,
    width: item.width,
    height: item.height,
    original: item.original,
    rawRgba: item.rawRgba,
  };
}

export function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(32);
  const [feather, setFeather] = useState(1.2);
  const [bgId, setBgId] = useState("clear");
  const [customHex, setCustomHex] = useState("#1B2430");
  const [customBg, setCustomBg] = useState<ImageBitmap | null>(null);
  const [split, setSplit] = useState(52);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const cutterRef = useRef<ReturnType<typeof createCutter> | null>(null);
  const queueRef = useRef<string[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const active = items.find((i) => i.id === activeId) || items[0] || null;
  const look = useMemo(() => ({ threshold, feather }), [threshold, feather]);

  const bg: Backdrop = useMemo(() => {
    if (customBg) return { id: "custom", label: "Image", kind: "image" };
    if (bgId === "hex") return { id: "hex", label: "Solid", kind: "solid", color: customHex };
    return BACKDROPS.find((b) => b.id === bgId) || BACKDROPS[0];
  }, [bgId, customBg, customHex]);

  const pump = useCallback(() => {
    if (busyId) return;
    const nextId = queueRef.current.find((id) => {
      const it = itemsRef.current.find((x) => x.id === id);
      return it && it.status === "queued";
    });
    if (!nextId) return;
    const it = itemsRef.current.find((x) => x.id === nextId);
    if (!it) return;
    setBusyId(nextId);
    setItems((prev) => prev.map((x) => (x.id === nextId ? { ...x, status: "cutting" } : x)));
    createImageBitmap(it.original).then((clone) => cutterRef.current?.cut(nextId, clone));
  }, [busyId]);

  useEffect(() => {
    const cutter = createCutter({
      onProgress: (p) => setProgress(p),
      onReady: () => {
        setModelReady(true);
        setProgress(null);
      },
      onResult: (id, width, height, rgba) => {
        setItems((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, width, height, rawRgba: rgba, status: "ready" } : x,
          ),
        );
        setBusyId(null);
        setProgress(null);
        queueRef.current = queueRef.current.filter((q) => q !== id);
      },
      onError: (message, id) => {
        setItems((prev) =>
          prev.map((x) => (id && x.id === id ? { ...x, status: "error", error: message } : x)),
        );
        setBusyId(null);
        setProgress({ phase: "cut", status: message });
        if (id) queueRef.current = queueRef.current.filter((q) => q !== id);
      },
    });
    cutterRef.current = cutter;
    return () => cutter.terminate();
  }, []);

  useEffect(() => {
    pump();
  }, [items, busyId, pump]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    const room = MAX - itemsRef.current.length;
    const take = list.slice(0, Math.max(0, room));
    const next: Item[] = [];
    for (const file of take) {
      try {
        const original = await bitmapFromFile(file);
        next.push({
          id: uid(),
          name: file.name || "photo",
          original,
          width: original.width,
          height: original.height,
          rawRgba: null,
          status: "queued",
        });
      } catch {
        /* skip unreadable */
      }
    }
    if (!next.length) return;
    queueRef.current.push(...next.map((n) => n.id));
    setItems((prev) => [...prev, ...next]);
    setActiveId((cur) => cur || next[0].id);
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    const onDrag = (e: DragEvent) => {
      e.preventDefault();
      if (e.type === "dragover") setOver(true);
      if (e.type === "dragleave") setOver(false);
      if (e.type === "drop") {
        setOver(false);
        if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDrag);
    window.addEventListener("dragleave", onDrag);
    window.addEventListener("drop", onDrag);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDrag);
      window.removeEventListener("dragleave", onDrag);
      window.removeEventListener("drop", onDrag);
    };
  }, [addFiles]);

  useEffect(() => {
    const after = afterRef.current;
    const before = beforeRef.current;
    if (!active || !after) return;
    const shot = toShot(active);
    if (shot && active.status === "ready") {
      renderPreview(after, shot, look, bg, customBg);
      if (before) renderOriginal(before, shot);
    } else {
      after.width = active.width;
      after.height = active.height;
      after.getContext("2d")!.drawImage(active.original, 0, 0);
      if (before) {
        before.width = active.width;
        before.height = active.height;
        before.getContext("2d")!.drawImage(active.original, 0, 0);
      }
    }
  }, [active, look, bg, customBg]);

  const onSplitPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      setSplit(Math.round(x * 100));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    el.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(e.nativeEvent);
  };

  const readyShots = items.map(toShot).filter((s): s is Shot => !!s);

  async function saveOne(type: "image/png" | "image/webp") {
    if (!active) return;
    const shot = toShot(active);
    if (!shot) return;
    const canvas = exportCanvas(shot, look, bg, customBg);
    const blob = await canvasToBlob(canvas, type);
    const ext = type === "image/webp" ? "webp" : "png";
    downloadBlob(blob, `${stem(active.name)}-cutout.${ext}`);
  }

  async function saveZip(type: "image/png" | "image/webp") {
    if (!readyShots.length) return;
    const blob = await zipCutouts(readyShots, look, bg, customBg, type);
    downloadBlob(blob, "mattekit.zip");
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    queueRef.current = queueRef.current.filter((q) => q !== id);
  }

  const pct =
    progress?.total && progress.loaded
      ? Math.round((progress.loaded / progress.total) * 100)
      : progress?.pct ?? (progress ? 12 : 0);

  const sizeLabel =
    progress?.total && progress.loaded
      ? `${(progress.loaded / 1e6).toFixed(1)} / ${(progress.total / 1e6).toFixed(0)} MB`
      : "";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="iris" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M16 5.5 L26.5 16 L16 26.5 L5.5 16 Z" fill="none" stroke="#D9CCAC" strokeWidth="1.6" />
              <circle cx="16" cy="16" r="4.2" fill="#D9CCAC" />
            </svg>
          </span>
          <span className="word">
            Matte<i>kit</i>
          </span>
        </div>
        <p className="privacy">
          <span className="dot" />
          Stays in this tab
        </p>
        <div className="top-actions">
          <button type="button" className="btn ghost small" onClick={() => fileRef.current?.click()}>
            Open
          </button>
          <button type="button" className="btn small" onClick={() => camRef.current?.click()}>
            Camera
          </button>
        </div>
      </header>

      <div className="shell">
        <section className="stage">
          {!items.length && (
            <div className="empty">
              <span className="kicker">Original cutout studio</span>
              <h1 className="hero" aria-label="Keep the subject.">
                <span className="line">
                  <span className="w" style={{ ["--i" as string]: 0 }}>
                    Keep
                  </span>{" "}
                  <span className="w" style={{ ["--i" as string]: 1 }}>
                    the
                  </span>
                </span>
                <span className="line">
                  <span className="w" style={{ ["--i" as string]: 2 }}>
                    <em>subject</em>
                  </span>
                  <span className="w" style={{ ["--i" as string]: 3 }}>
                    .
                  </span>
                </span>
              </h1>
              <p className="lede">Hair-ok mattes. No account, no credits, no upload.</p>
              <div className={`drop ${over ? "is-over" : ""}`}>
                <p>Drop a photo, paste, or pick from your camera roll</p>
                <div className="drop-row">
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    Open photos
                  </button>
                  <button type="button" className="btn ghost" onClick={() => camRef.current?.click()}>
                    Camera
                  </button>
                </div>
              </div>
            </div>
          )}

          {!!items.length && active && active.status === "ready" && (
            <div
              className="compare"
              style={{
                ["--split" as string]: `${split}%`,
                ["--ar" as string]: `${active.width} / ${active.height}`,
              }}
              onPointerDown={onSplitPointer}
            >
              <div className="frame">
                <canvas ref={afterRef} className="after" />
                <canvas ref={beforeRef} className="before" />
                <span className="badge l">Before</span>
                <span className="badge r">After</span>
                <div className="handle">
                  <i>↔</i>
                </div>
              </div>
            </div>
          )}

          {!!items.length && active && active.status !== "ready" && (
            <div className="busy-stage">
              <canvas ref={afterRef} />
              <div className="progress-card" role="status">
                <p>
                  {progress?.status || (active.status === "error" ? active.error : "Waiting for the model…")}
                  {sizeLabel ? `  ${sizeLabel}` : ""}
                </p>
                <div className="bar">
                  <span style={{ ["--pct" as string]: `${Math.max(6, pct)}%` }} />
                </div>
              </div>
            </div>
          )}
        </section>

        {!!items.length && (
          <aside className="rail">
            <section className="block">
              <h2>Backdrop</h2>
              <div className="swatches">
                {BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`swatch ${bgId === b.id && !customBg ? "is-on" : ""}`}
                    style={{ background: swatchCss(b) }}
                    title={b.label}
                    onClick={() => {
                      setCustomBg(null);
                      setBgId(b.id);
                    }}
                  />
                ))}
                <button
                  type="button"
                  className={`swatch ${bgId === "hex" && !customBg ? "is-on" : ""}`}
                  style={{ background: customHex }}
                  title="Custom hex"
                  onClick={() => {
                    setCustomBg(null);
                    setBgId("hex");
                  }}
                />
              </div>
              <label className="hex-row">
                <span>Hex</span>
                <input
                  value={customHex}
                  onChange={(e) => {
                    setCustomHex(e.target.value);
                    setCustomBg(null);
                    setBgId("hex");
                  }}
                  spellCheck={false}
                  maxLength={7}
                />
              </label>
              <div className="export-row" style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost small" onClick={() => bgFileRef.current?.click()}>
                  Custom image
                </button>
                {customBg && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      customBg.close();
                      setCustomBg(null);
                      setBgId("clear");
                    }}
                  >
                    Clear image
                  </button>
                )}
              </div>
            </section>

            <section className="block">
              <h2>Matte</h2>
              <label className="slider">
                <span className="slider-meta">
                  <span>Feather</span>
                  <span>{feather.toFixed(1)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.2}
                  value={feather}
                  onChange={(e) => setFeather(Number(e.target.value))}
                />
              </label>
              <label className="slider">
                <span className="slider-meta">
                  <span>Threshold</span>
                  <span>{Math.round(threshold)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </label>
            </section>

            <section className="block">
              <h2>Export</h2>
              <div className="export-row">
                <button type="button" className="btn" disabled={!toShot(active!)} onClick={() => saveOne("image/png")}>
                  PNG
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!toShot(active!)}
                  onClick={() => saveOne("image/webp")}
                >
                  WebP
                </button>
              </div>
              <button
                type="button"
                className="btn ghost full small"
                style={{ marginTop: 8 }}
                disabled={readyShots.length < 1}
                onClick={() => saveZip("image/png")}
              >
                ZIP {readyShots.length > 1 ? `${readyShots.length} PNG` : "batch"}
              </button>
              {!modelReady && progress && <p className="err" style={{ color: "var(--mist)", marginTop: 10 }}>{progress.status}</p>}
            </section>
          </aside>
        )}

        {!!items.length && (
          <div className="film">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                className={`thumb ${it.id === active?.id ? "is-on" : ""}`}
                onClick={() => setActiveId(it.id)}
              >
                <Thumb bmp={it.original} />
                {it.status !== "ready" && <span className="spin" />}
                <span
                  className="x"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(it.id);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            {items.length < MAX && (
              <button type="button" className="thumb add-thumb" onClick={() => fileRef.current?.click()}>
                +
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={bgFileRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const bmp = await bitmapFromFile(f);
          setCustomBg(bmp);
        }}
      />
    </div>
  );
}

function Thumb({ bmp }: { bmp: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 144;
    c.height = 144;
    const ctx = c.getContext("2d")!;
    const scale = Math.max(144 / bmp.width, 144 / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.drawImage(bmp, (144 - w) / 2, (144 - h) / 2, w, h);
  }, [bmp]);
  return <canvas ref={ref} />;
}
