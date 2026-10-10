"use client";
/**
 * The wave · the live Perpl mid drawn as a swell, with the rider on its face.
 *
 * The rider sits near the right edge, on the newest price. Their band sets
 * where on the face they ride: up on the CREST (long), on the LINE (flat), or
 * down in the TROUGH (short). Perpl's real trades surface as bubbles: buys
 * rise in cyan, sells sink in pink, sized by notional. A wipeout (a stop hit)
 * flashes the water.
 *
 * Input: swipe up/down on the wave, or arrow keys / W·S on a keyboard.
 */
import { useEffect, useRef } from "react";
import type { Band } from "@/lib/ride/engine";
import type { TapeTrade } from "@/lib/perpl/market";

interface Props {
  series: number[];
  tape: TapeTrade[];
  band: Band;
  target: Band;
  entryPx: number;
  wipeouts: number;
  riding: boolean;
  onBand?: (b: Band) => void;
}

const C = {
  ink: "#0e091c",
  monad: "#6e54ff",
  lavender: "#ddd7fe",
  cyan: "#85e6ff",
  pink: "#ff8ee4",
  amber: "#ffae45",
};

/** Centered moving average: coarse-tick markets (MON moves ~4 bps a tick) read
 *  as swell instead of stairs. The newest point keeps a shrinking window, so the
 *  rider's price stays honest. */
function smooth(xs: number[], half = 3): number[] {
  return xs.map((_, i) => {
    const h = Math.min(half, i, xs.length - 1 - i);
    let sum = 0;
    for (let j = i - h; j <= i + h; j++) sum += xs[j];
    return sum / (2 * h + 1);
  });
}

/** Trace a smooth curve through points with quadratic segments via midpoints. */
function curve(ctx: CanvasRenderingContext2D | Path2D, xy: [number, number][], move: boolean) {
  if (!xy.length) return;
  if (move) ctx.moveTo(xy[0][0], xy[0][1]);
  else ctx.lineTo(xy[0][0], xy[0][1]);
  for (let i = 1; i < xy.length - 1; i++) {
    const mx = (xy[i][0] + xy[i + 1][0]) / 2;
    const my = (xy[i][1] + xy[i + 1][1]) / 2;
    ctx.quadraticCurveTo(xy[i][0], xy[i][1], mx, my);
  }
  const l = xy[xy.length - 1];
  ctx.lineTo(l[0], l[1]);
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  life: number;
  buy: boolean;
}

export function WaveCanvas({ series, tape, band, target, entryPx, wipeouts, riding, onBand }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ series, band, target, entryPx, riding });
  props.current = { series, band, target, entryPx, riding };
  const bubbles = useRef<Bubble[]>([]);
  const seen = useRef(new Set<string>());
  const flash = useRef(0);
  const lastWipe = useRef(wipeouts);
  const riderY = useRef<number | null>(null);

  // new tape prints → bubbles
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    for (const t of tape.slice(0, 8)) {
      const k = `${t.txid ?? ""}-${t.t}-${t.px}-${t.size}`;
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (Date.now() - t.t > 20_000) continue;
      const usd = t.px * t.size;
      bubbles.current.push({
        x: w * (0.55 + Math.random() * 0.4),
        y: h * (t.side === "buy" ? 0.75 : 0.35),
        r: Math.min(14, 2.5 + Math.sqrt(usd) / 6),
        vy: t.side === "buy" ? -0.5 - Math.random() * 0.4 : 0.45 + Math.random() * 0.4,
        life: 1,
        buy: t.side === "buy",
      });
    }
    if (seen.current.size > 400) seen.current = new Set([...seen.current].slice(-200));
  }, [tape]);

  useEffect(() => {
    if (wipeouts > lastWipe.current) flash.current = 1;
    lastWipe.current = wipeouts;
  }, [wipeouts]);

  // swipe + keys
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !onBand) return;
    let y0: number | null = null;
    const down = (e: PointerEvent) => {
      y0 = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (y0 == null) return;
      const dy = e.clientY - y0;
      y0 = null;
      if (Math.abs(dy) < 28) return;
      const b = props.current.target;
      onBand(dy < 0 ? (Math.min(1, b + 1) as Band) : (Math.max(-1, b - 1) as Band));
    };
    const key = (e: KeyboardEvent) => {
      const b = props.current.target;
      if (e.key === "ArrowUp" || e.key === "w") onBand(Math.min(1, b + 1) as Band);
      else if (e.key === "ArrowDown" || e.key === "s") onBand(Math.max(-1, b - 1) as Band);
      else if (e.key === " " || e.key === "x") onBand(0);
      else return;
      e.preventDefault();
    };
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      cv.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }, [onBand]);

  // render loop
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let t0 = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (now: number) => {
      const dt = Math.min(50, now - t0);
      t0 = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { series: s, band, target, entryPx, riding } = props.current;
      const pts = s.length > 1 ? smooth(s) : [1, 1];
      let lo = Math.min(...pts);
      let hi = Math.max(...pts);
      if (entryPx) {
        lo = Math.min(lo, entryPx);
        hi = Math.max(hi, entryPx);
      }
      const pad = (hi - lo) * 0.35 || hi * 0.0005 || 1;
      lo -= pad;
      hi += pad;
      const top = h * 0.12;
      const bottom = h * 0.88;
      const yOf = (p: number) => bottom - ((p - lo) / (hi - lo)) * (bottom - top);
      const riderX = w * 0.78;
      const xOf = (i: number) => (i / (pts.length - 1)) * riderX;

      // sky glow
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "rgba(110,84,255,0.10)");
      sky.addColorStop(1, "rgba(14,9,28,0)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // the swell: the wave body, plus a swash that runs ahead of the rider
      const wob = reduce ? 0 : now / 900;
      const path = new Path2D();
      const xy = pts.map((p, i) => [xOf(i), yOf(p)] as [number, number]);
      path.moveTo(0, h);
      curve(path, xy, false);
      const last = yOf(pts[pts.length - 1]);
      for (let x = riderX; x <= w + 8; x += 8) {
        const k = (x - riderX) / (w - riderX + 1);
        path.lineTo(x, last + Math.sin(k * 5 + wob) * 6 * k + k * k * 30);
      }
      path.lineTo(w, h);
      path.closePath();
      const sea = ctx.createLinearGradient(0, top, 0, h);
      sea.addColorStop(0, "rgba(110,84,255,0.55)");
      sea.addColorStop(0.6, "rgba(110,84,255,0.18)");
      sea.addColorStop(1, "rgba(110,84,255,0.04)");
      ctx.fillStyle = sea;
      ctx.fill(path);

      // crest line
      ctx.beginPath();
      curve(ctx, xy, true);
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // entry line while positioned
      if (entryPx && band !== 0) {
        const y = yOf(entryPx);
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = band > 0 ? "rgba(133,230,255,0.6)" : "rgba(255,142,228,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // bubbles from the tape
      ctx.globalCompositeOperation = "lighter";
      bubbles.current = bubbles.current.filter((b) => b.life > 0);
      for (const b of bubbles.current) {
        b.y += b.vy * (dt / 16);
        b.life -= dt / 2600;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.buy ? `rgba(133,230,255,${0.35 * b.life})` : `rgba(255,142,228,${0.35 * b.life})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // the rider: on the crest, the line, or in the trough of the newest price
      const offset = Math.max(28, h * 0.11);
      const wantY = last - band * offset;
      riderY.current = riderY.current == null ? wantY : riderY.current + (wantY - riderY.current) * Math.min(1, dt / 120);
      const ry = riderY.current;
      const color = band > 0 ? C.cyan : band < 0 ? C.pink : C.lavender;
      const tilt = (target - band) * -0.35 + (reduce ? 0 : Math.sin(now / 300) * 0.05);
      ctx.save();
      ctx.translate(riderX, ry);
      ctx.rotate(tilt);
      // board
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = riding ? 18 : 6;
      ctx.beginPath();
      ctx.ellipse(0, 10, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // rider
      ctx.fillStyle = C.lavender;
      ctx.beginPath();
      ctx.arc(0, -10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.lavender;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(0, 6);
      ctx.moveTo(-9, -2);
      ctx.lineTo(9, -6);
      ctx.stroke();
      ctx.restore();

      // pending move indicator
      if (target !== band) {
        ctx.fillStyle = target > band ? C.cyan : C.pink;
        ctx.beginPath();
        const dir = target > band ? -1 : 1;
        ctx.moveTo(riderX + 30, ry + dir * 4);
        ctx.lineTo(riderX + 38, ry + dir * 14);
        ctx.lineTo(riderX + 22, ry + dir * 14);
        ctx.fill();
      }

      // wipeout flash
      if (flash.current > 0) {
        ctx.fillStyle = `rgba(255,142,228,${0.35 * flash.current})`;
        ctx.fillRect(0, 0, w, h);
        flash.current = Math.max(0, flash.current - dt / 500);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="block h-full w-full touch-none select-none"
      aria-label="Live price wave. Swipe up to go long, down to go short."
      role="img"
    />
  );
}
