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

const STATES: Record<string, { n: number; spin: number; wobble: number; scan?: boolean; pulse?: number }> = {
  working: { n: 168, spin: 0.85, wobble: 0.28 },
  searching: { n: 176, spin: 1.05, wobble: 0.1, scan: true },
  solving: { n: 160, spin: 0.55, wobble: 0.62 },
  listening: { n: 148, spin: 0.38, wobble: 0.85, pulse: 0.22 },
  connecting: { n: 132, spin: 0.7, wobble: 0.18, pulse: 0.08 },
  weaving: { n: 172, spin: 0.92, wobble: 0.48 },
  composing: { n: 156, spin: 0.62, wobble: 0.5, pulse: 0.1 },
  breathing: { n: 120, spin: 0.26, wobble: 0.12, pulse: 0.28 },
  shaping: { n: 164, spin: 0.5, wobble: 0.36, pulse: 0.06 },
};

function readHostTone(): StatusOrbTone {
  if (typeof document === "undefined") return "light";
  const host = getComputedStyle(document.documentElement).colorScheme || "";
  if (host.includes("dark") && !host.includes("light")) return "dark";
  if (host.includes("light") && !host.includes("dark")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function OrbCanvas({ state, theme, size = 20 }: { state: StatusOrbState; theme: StatusOrbTone; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const themeRef = useRef(theme);
  stateRef.current = state;
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    let alive = true;
    let vis = true;
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      vis = !!(entries[0] && entries[0].isIntersecting);
    }) : null;
    if (io) io.observe(canvas);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const paint = () => {
      const spec = STATES[stateRef.current] || STATES.working;
      let t = ((performance.now() - t0) / 1000) * spec.spin;
      if (reduced) t = 0.35;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const breathe = spec.pulse ? 1 + Math.sin(t * 2.2) * spec.pulse : 1;
      const r = size * 0.42 * breathe;
      const ink = themeRef.current === "dark" ? "rgba(240,239,236," : "rgba(13,15,20,";
      const n = spec.n;
      const tilt = 0.62;
      const yaw = t * 1.15;
      for (let i = 0; i < n; i++) {
        const y = 1 - ((i + 0.5) / n) * 2;
        const ringR = Math.sqrt(Math.max(0, 1 - y * y));
        let lon = i * golden + yaw;
        if (spec.wobble) lon += Math.sin(t * 1.35 + y * 3) * spec.wobble * 0.22;
        const x = Math.cos(lon) * ringR;
        const z = Math.sin(lon) * ringR;
        const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
        const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
        const persp = 1 / (1.65 - z2);
        const px = cx + x * r * persp;
        const py = cy + y2 * r * persp;
        let a = 0.16 + 0.78 * ((z2 + 1) / 2);
        if (spec.scan) {
          const sweep = (Math.sin(t * 1.7) + 1) / 2;
          const dist = Math.abs(((lon / (Math.PI * 2) + 1) % 1) - sweep);
          a *= 0.32 + 0.68 * (1 - Math.min(1, dist * 3.4));
        }
        const rad = (0.42 + persp * 0.48) * (size / 20);
        ctx.beginPath();
        ctx.fillStyle = ink + a.toFixed(3) + ")";
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const loop = () => {
      if (!alive) return;
      if (vis && !document.hidden) paint();
      if (!reduced) raf = requestAnimationFrame(loop);
    };
    paint();
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, [size]);

  return <canvas ref={ref} aria-hidden="true" />;
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
        <OrbCanvas state={state} theme={scheme} size={20} />
      </span>
      <span className="orb-label">{label}</span>
    </span>
  );
}
