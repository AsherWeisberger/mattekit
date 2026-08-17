import { useEffect, useRef, useState } from "react";

export type StatusOrbState =
  | "working"
  | "searching"
  | "solving"
  | "listening"
  | "connecting"
  | "weaving"
  | "composing"
  | "breathing"
  | "shaping";

export type StatusOrbTone = "dark" | "light";

/** 20px dotted thought-orb. Idea from Jakub Antalik; original cheap canvas, not the 64px particle field. */
const CSS_SIZE = 20;
const DOTS = 28;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TILT = 0.62;
const COS_TILT = Math.cos(TILT);
const SIN_TILT = Math.sin(TILT);

const LATTICE = Array.from({ length: DOTS }, (_, i) => {
  const y = 1 - ((i + 0.5) / DOTS) * 2;
  return { y, ringR: Math.sqrt(Math.max(0, 1 - y * y)), lon0: i * GOLDEN };
});

const STATES: Record<string, { spin: number; wobble: number; scan?: boolean; pulse?: number }> = {
  working: { spin: 0.85, wobble: 0.28 },
  searching: { spin: 1.05, wobble: 0.1, scan: true },
  solving: { spin: 0.55, wobble: 0.62 },
  listening: { spin: 0.38, wobble: 0.85, pulse: 0.22 },
  connecting: { spin: 0.7, wobble: 0.18, pulse: 0.08 },
  weaving: { spin: 0.92, wobble: 0.48 },
  composing: { spin: 0.62, wobble: 0.5, pulse: 0.1 },
  breathing: { spin: 0.26, wobble: 0.12, pulse: 0.28 },
  shaping: { spin: 0.5, wobble: 0.36, pulse: 0.06 },
};

function readHostTone(): StatusOrbTone {
  if (typeof document === "undefined") return "light";
  const host = getComputedStyle(document.documentElement).colorScheme || "";
  if (host.includes("dark") && !host.includes("light")) return "dark";
  if (host.includes("light") && !host.includes("dark")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function OrbCanvas({ state, theme, size = CSS_SIZE }: { state: StatusOrbState; theme: StatusOrbTone; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const themeRef = useRef(theme);
  stateRef.current = state;
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;
    const css = Math.max(20, Math.min(28, size));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    canvas.style.width = css + "px";
    canvas.style.height = css + "px";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    let alive = true;
    let vis = true;
    let running = false;

    const paint = () => {
      const spec = STATES[stateRef.current] || STATES.working;
      let t = ((performance.now() - t0) / 1000) * spec.spin;
      if (reduced) t = 0.35;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, css, css);
      const cx = css / 2;
      const cy = css / 2;
      const breathe = spec.pulse ? 1 + Math.sin(t * 2.2) * spec.pulse : 1;
      const r = css * 0.42 * breathe;
      ctx.fillStyle = themeRef.current === "dark" ? "rgb(240,239,236)" : "rgb(13,15,20)";
      const yaw = t * 1.15;
      const wob = spec.wobble ? spec.wobble * 0.22 : 0;
      const sweep = spec.scan ? (Math.sin(t * 1.7) + 1) / 2 : 0;
      for (let i = 0; i < DOTS; i++) {
        const p = LATTICE[i];
        let lon = p.lon0 + yaw;
        if (wob) lon += Math.sin(t * 1.35 + p.y * 3) * wob;
        const x = Math.cos(lon) * p.ringR;
        const z = Math.sin(lon) * p.ringR;
        const y2 = p.y * COS_TILT - z * SIN_TILT;
        const z2 = p.y * SIN_TILT + z * COS_TILT;
        const persp = 1 / (1.65 - z2);
        const px = cx + x * r * persp;
        const py = cy + y2 * r * persp;
        let a = 0.18 + 0.72 * ((z2 + 1) / 2);
        if (spec.scan) {
          const dist = Math.abs(((lon / (Math.PI * 2) + 1) % 1) - sweep);
          a *= 0.32 + 0.68 * (1 - Math.min(1, dist * 3.4));
        }
        const rad = 0.55 + persp * 0.35;
        ctx.globalAlpha = a;
        ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      ctx.globalAlpha = 1;
    };

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const tick = () => {
      if (!alive || !running) return;
      paint();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!alive || reduced || running) return;
      if (!vis || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            vis = !!(entries[0] && entries[0].isIntersecting);
            if (vis) start();
            else stop();
          })
        : null;
    if (io) io.observe(canvas);
    document.addEventListener("visibilitychange", onVis);
    paint();
    start();
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVis);
      if (io) io.disconnect();
    };
  }, [size]);

  return <canvas ref={ref} width={20} height={20} aria-hidden="true" />;
}

export function OrbDot({
  state = "working",
  theme,
}: {
  state?: StatusOrbState;
  theme: StatusOrbTone;
}) {
  return <OrbCanvas state={state} theme={theme} size={CSS_SIZE} />;
}

export function StatusOrb({
  label,
  state = "working",
  tone,
  className = "",
}: {
  label: string;
  state?: StatusOrbState;
  tone?: StatusOrbTone;
  className?: string;
}) {
  const [scheme, setScheme] = useState<StatusOrbTone>(() => tone || readHostTone());

  useEffect(() => {
    if (tone) {
      setScheme(tone);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setScheme(readHostTone());
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [tone]);

  return (
    <span className={"orb-pill " + scheme + (className ? " " + className : "")} data-theme={scheme} role="status">
      <span className="orb-dot" aria-hidden="true">
        <OrbDot state={state} theme={scheme} />
      </span>
      <span className="orb-label">{label}</span>
    </span>
  );
}
