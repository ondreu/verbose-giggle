import { useEffect, useRef } from "react";

/**
 * Ambient ember/spark backdrop (#3): warm motes that drift up behind the whole
 * UI like firelight in a dark hall. A single fixed, pointer-events-none canvas
 * painted below the app chrome (z-0). Cheap by design — particle count scales
 * with viewport area and is capped, the loop pauses when the tab is hidden, and
 * it honours `prefers-reduced-motion` (a faint static scatter, no animation).
 */

interface Ember {
  x: number;
  y: number;
  r: number; // radius in CSS px
  vy: number; // upward speed (px/s)
  drift: number; // horizontal sway amplitude
  phase: number; // sway phase
  swaySpeed: number;
  hue: number; // 0 = gold, 1 = ember-orange
  flicker: number; // flicker phase
  baseAlpha: number;
}

// Warm palette endpoints (bright ember → deep red) sampled per particle, biased
// toward red for a livelier firelight glow.
const EMBER = [232, 138, 58] as const;
const RED = [196, 54, 28] as const;

function mix(t: number): string {
  const r = Math.round(EMBER[0] + (RED[0] - EMBER[0]) * t);
  const g = Math.round(EMBER[1] + (RED[1] - EMBER[1]) * t);
  const b = Math.round(EMBER[2] + (RED[2] - EMBER[2]) * t);
  return `${r}, ${g}, ${b}`;
}

export function EmberField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let embers: Ember[] = [];

    const spawn = (atBottom: boolean): Ember => ({
      x: Math.random() * w,
      // New particles rise from just below the fold; the initial fill is scattered.
      y: atBottom ? h + Math.random() * 60 : Math.random() * h,
      r: 0.5 + Math.random() * 2.2,
      // Faster and more varied — a brisker, livelier rise.
      vy: 14 + Math.random() * 46,
      drift: 8 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.4 + Math.random() * 1.4,
      // Red-biased: most particles sit toward the deep-red end.
      hue: Math.pow(Math.random(), 0.6),
      flicker: Math.random() * Math.PI * 2,
      baseAlpha: 0.3 + Math.random() * 0.55,
    });

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Density scales with area but is capped so big screens stay cheap.
      const count = Math.min(120, Math.round((w * h) / 20000));
      embers = Array.from({ length: count }, () => spawn(false));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const e of embers) {
        // Faster, deeper flicker for a more alive, restless glow.
        const flick = 0.5 + 0.5 * Math.sin(t * 0.009 + e.flicker);
        const alpha = e.baseAlpha * flick;
        const px = e.x + Math.sin(t * 0.0016 * e.swaySpeed + e.phase) * e.drift;
        const grad = ctx.createRadialGradient(px, e.y, 0, px, e.y, e.r * 4);
        const rgb = mix(e.hue);
        grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, e.y, e.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    if (reduced) {
      resize();
      // Static, faint scatter — atmosphere without motion.
      draw(0);
      const onResize = () => {
        resize();
        draw(0);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp after tab-switch
      last = now;
      for (const e of embers) {
        e.y -= e.vy * dt;
        if (e.y < -10) Object.assign(e, spawn(true));
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
