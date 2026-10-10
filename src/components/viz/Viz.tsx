"use client";

/**
 * 📊 THE PIT BOARD KIT · small, honest pictures of money.
 *
 * The rider (2026-10-04): "we seem to be so so text everywhere … it is
 * supposed to be intuitive, fun to go through, an experience — so relevant
 * info isn't missed." A number a rider has to read a sentence to understand
 * is a number they skip. These draw the few shapes money actually has:
 *
 *   TugMeter   what a book pays vs what it earns, and the net between them
 *   SplitBar   who a cost goes to (one segment per venue · free shows free)
 *   Spark      a rate over time, its zero line and its average
 *   Waterfall  where the money went, step by step, to the net
 *
 * Grand Prix rules: steel borders, flat fills, green ONLY for money in, red
 * for money out, papaya for the needle a rider acts on. Motion states facts
 * only — bars grow to their value once — and holds still under reduced motion.
 */
import { motion, useReducedMotion } from "framer-motion";
import { signedUsd, usd, liqTone, PER1M_GOOD, PER1M_OK } from "./scales";

/* the scales live in a plain module so a server page can colour a number with
   them · a "use client" module's functions cannot be called on the server */
export { signedUsd, usd, LIQ_DANGER, LIQ_WATCH, liqTone, PER1M_GOOD, PER1M_OK, PER1M_SCALE_WORDS, per1mBg, per1mTone, per1mText } from "./scales";

const EASE = [0.22, 1, 0.36, 1] as const;


/* ── ⚖ TUG METER · fees pull left, funding pulls right, the needle is net ── */
export function TugMeter({
  pay,
  earn,
  label = "fees vs funding",
  height = 12,
}: {
  /** dollars paid (fees) · ≥ 0 */
  pay: number;
  /** dollars earned (funding received) · may be negative (funding paid) */
  earn: number;
  label?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const earnPos = Math.max(0, earn);
  // funding PAID is money out too · it pulls left with the fees
  const out = pay + Math.max(0, -earn);
  const max = Math.max(out, earnPos, 0.01);
  const outPct = (out / max) * 50;
  const inPct = (earnPos / max) * 50;
  const net = earn - pay;
  const needle = Math.max(1.5, Math.min(98.5, 50 + (net / max) * 50));
  const t = reduce ? { duration: 0 } : { duration: 0.7, ease: EASE };
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={`${label}: pays ${usd(out)}, earns ${usd(earnPos)}, net ${signedUsd(net)}`}>
      <div className="absolute inset-0 border border-steel bg-ink" />
      <motion.div
        className="absolute bottom-px right-1/2 top-px bg-blood/75"
        initial={{ width: reduce ? `${outPct}%` : 0 }}
        animate={{ width: `${outPct}%` }}
        transition={t}
      />
      <motion.div
        className="absolute bottom-px left-1/2 top-px bg-chart/75"
        initial={{ width: reduce ? `${inPct}%` : 0 }}
        animate={{ width: `${inPct}%` }}
        transition={t}
      />
      {/* zero · where a book that pays for itself would sit */}
      <div className="absolute -bottom-1 -top-1 left-1/2 w-px -translate-x-1/2 bg-bone/60" />
      {/* the net · the one mark a rider decides on */}
      <motion.div
        className="absolute -bottom-1.5 -top-1.5 w-[3px] -translate-x-1/2 bg-papaya shadow-[0_0_6px_var(--papaya)]"
        initial={{ left: reduce ? `${needle}%` : "50%" }}
        animate={{ left: `${needle}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE, delay: 0.15 }}
      />
    </div>
  );
}

/* ── ▤ SPLIT BAR · one cost, split by who charges it ─────────────────────── */
export function SplitBar({
  parts,
  height = 10,
}: {
  parts: { key: string; label: string; value: number; tone?: "blood" | "amber" | "flat" }[];
  height?: number;
}) {
  const reduce = useReducedMotion();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (!(total > 0))
    return (
      <div className="flex w-full items-center justify-center border border-chart/50 bg-chart/10 text-[9.5px] font-bold uppercase tracking-wide text-chart" style={{ height: height + 4 }}>
        free
      </div>
    );
  return (
    <div className="flex w-full gap-px border border-steel bg-ink" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${usd(p.value)}`).join(", ")}>
      {parts
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <motion.div
            key={p.key}
            className={p.tone === "amber" ? "bg-amber/80" : p.tone === "flat" ? "bg-flat/60" : "bg-blood/75"}
            initial={{ flexGrow: reduce ? p.value / total : 0.0001 }}
            animate={{ flexGrow: p.value / total }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: i * 0.08 }}
            style={{ flexBasis: 0 }}
            title={`${p.label} ${usd(p.value)}`}
          />
        ))}
    </div>
  );
}

/* ── 〰 SPARK · a rate over time, its zero and its average ────────────────── */
export function Spark({
  values,
  width = 96,
  height = 26,
  title,
}: {
  values: number[];
  width?: number;
  height?: number;
  title?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const avg = values.reduce((a, v) => a + v, 0) / values.length;
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0 overflow-visible" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {/* zero · above it the rate pays this side, below it charges it */}
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--steel)" strokeWidth={1} />
      {/* the average · what "usually" means */}
      <line x1={0} x2={width} y1={y(avg)} y2={y(avg)} stroke="var(--flat)" strokeWidth={1} strokeDasharray="2 3" />
      <polyline points={pts} fill="none" stroke={last >= 0 ? "var(--chart)" : "var(--blood)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.2} fill={last >= 0 ? "var(--chart)" : "var(--blood)"} />
    </svg>
  );
}

/* ── 📉 WATERFALL · where the money went, to the net ──────────────────────── */
export function Waterfall({
  steps,
  netLabel = "net",
}: {
  /** in order · each moves the running total */
  steps: { label: string; value: number; sub?: string }[];
  netLabel?: string;
}) {
  const reduce = useReducedMotion();
  let run = 0;
  const rows = steps.map((s) => {
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });
  const net = run;
  const lo = Math.min(0, ...rows.map((r) => Math.min(r.from, r.to)));
  const hi = Math.max(0, ...rows.map((r) => Math.max(r.from, r.to)));
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const all = [...rows, { label: netLabel, value: net, from: 0, to: net, sub: undefined as string | undefined, isNet: true }];
  return (
    <div className="grid grid-cols-[minmax(6.5rem,auto)_1fr_auto] items-center gap-x-2.5 gap-y-1.5 text-[11.5px] tabular-nums">
      {all.map((r, i) => {
        const left = pct(Math.min(r.from, r.to));
        const width = Math.max(0.8, Math.abs(pct(r.to) - pct(r.from)));
        const isNet = "isNet" in r && r.isNet;
        const tone = r.value >= 0 ? "bg-chart/75" : "bg-blood/75";
        return (
          <div key={`${r.label}-${i}`} className="contents">
            <span className={isNet ? "display text-[10px] font-black uppercase tracking-wide text-bone" : "text-flat"}>
              {r.label}
              {r.sub && <span className="block text-[9.5px] text-flat-dim">{r.sub}</span>}
            </span>
            <div className={`relative h-3.5 ${isNet ? "border-t border-steel pt-0" : ""}`}>
              {/* zero line */}
              <div className="absolute -bottom-0.5 -top-0.5 w-px bg-bone/40" style={{ left: `${pct(0)}%` }} />
              <motion.div
                className={`absolute bottom-0 top-0 ${isNet ? (r.value >= 0 ? "bg-chart" : "bg-blood") : tone}`}
                style={{ left: `${left}%` }}
                initial={{ width: reduce ? `${width}%` : 0 }}
                animate={{ width: `${width}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE, delay: 0.1 + i * 0.12 }}
              />
            </div>
            <b className={`whitespace-nowrap text-right ${r.value >= 0 ? "text-chart" : "text-blood"} ${isNet ? "text-[13px]" : ""}`}>{signedUsd(r.value)}</b>
          </div>
        );
      })}
    </div>
  );
}

/* ── 🏁 POSITION · a grid slot, P1 … Pn ─────────────────────────────────── */
export function Position({ n, you = false }: { n: number; you?: boolean }) {
  return (
    <span
      className={`display inline-flex h-6 min-w-[2.1rem] shrink-0 items-center justify-center border-2 px-1 text-[10.5px] font-black ${
        n === 1 ? "border-papaya bg-papaya text-ink" : you ? "border-papaya text-papaya" : "border-steel text-bone"
      }`}
    >
      P{n}
    </span>
  );
}

/* ── ↔ NET BAR · one row's net per day on a shared scale, from zero ─────── */
export function NetBar({ value, scale, height = 8 }: { value: number; scale: number; height?: number }) {
  const reduce = useReducedMotion();
  const w = Math.min(50, (Math.abs(value) / (scale || 1)) * 50);
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={`net ${signedUsd(value)} a day`}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-bone/40" />
      <motion.div
        className={`absolute inset-y-0 ${value >= 0 ? "left-1/2 bg-chart/80" : "right-1/2 bg-blood/75"}`}
        initial={{ width: reduce ? `${w}%` : 0 }}
        animate={{ width: `${w}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE }}
      />
    </div>
  );
}

/* ── 🏎 a car, side-on, in the line-art the app's icons use ─────────────── */
export function Car({ tone, size = 26 }: { tone: "chart" | "blood" | "papaya" | "sky" | "flat"; size?: number }) {
  return (
    <svg width={size} height={size / 2} viewBox="0 0 26 13" fill="none" stroke={`var(--${tone})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 9.5h21.5M3.5 9.5l1.5-3.5 4-1.5h6.5l4.5 3h2.5l1 2" />
      <circle cx="7.5" cy="10.5" r="1.8" fill="var(--ink)" />
      <circle cx="18.5" cy="10.5" r="1.8" fill="var(--ink)" />
    </svg>
  );
}

/* ── 🧯 HOW FAR TO LIQUIDATION · one meter, everywhere a position shows ──
   The same fact was a percentage on Money, a bare price on the desk and a
   sentence in the desk's fine print. Full = far; it drains toward the venue's
   liquidation and turns amber under 25%, red under 10% — the same lines the
   Money page's "closest to liquidation" uses (liqTone), so one position never
   reads safe in one place and in danger in another. */
export function LiqMeter({ awayPct, width = 64 }: { awayPct: number | null; width?: number }) {
  if (awayPct == null || !Number.isFinite(awayPct)) return <span className="text-flat-dim">—</span>;
  const f = Math.min(1, Math.max(0.03, awayPct / 40));
  const t = liqTone(awayPct);
  const tone = t === "bad" ? "bg-blood" : t === "warn" ? "bg-amber" : "bg-chart";
  const text = t === "bad" ? "text-blood" : t === "warn" ? "text-amber" : "text-flat";
  return (
    <span className="inline-flex flex-col items-end gap-0.5" role="img" aria-label={`liquidation ${awayPct.toFixed(1)}% away`}>
      <span className="block h-[5px] border border-steel bg-ink" style={{ width }}>
        <span className={`block h-full ${tone}`} style={{ width: `${f * 100}%` }} />
      </span>
      <span className={`text-[10px] font-bold tabular-nums ${text}`}>{awayPct.toFixed(1)}% away</span>
    </span>
  );
}

/* ── 🎯 THE COST FIELD · one axis of $ per $1M, everyone on it ─────────────
   "Other people farm this cheaply" was answered with a paragraph of address
   prefixes and numbers. Drawn: your book (the car), what the busiest resting
   accounts here really paid (filled dots both ways, hollow when one-sided —
   that is a bet, not a farming cost), and any book that pays more right now
   (green diamonds). + = paid, − = earned. */
export function CostField({
  you,
  youMeasured,
  peers,
  others = [],
}: {
  you: number | null;
  youMeasured?: boolean;
  peers: { perM: number; oneSided: boolean }[];
  others?: { perM: number; label: string }[];
}) {
  const vals = [...peers.map((x) => x.perM), ...others.map((o) => o.perM), ...(you != null ? [you] : [])];
  if (!vals.length) return null;
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const at = (v: number) => (hi - lo < 1e-9 ? 0.5 : (v - lo) / (hi - lo));
  return (
    <div className="w-full">
      <div className="relative h-[22px] w-full" role="img" aria-label={`cost per $1M · yours ${you != null ? Math.round(you) : "unknown"} · ${peers.length} resting accounts · ${others.length} better books`}>
        <div className="absolute inset-x-0 top-1/2 border-t border-steel" />
        {lo < 0 && <div className="absolute top-0 h-full border-l border-dashed border-flat-dim" style={{ left: `${at(0) * 100}%` }} />}
        {peers.map((x, i) => (
          <span
            key={`p${i}`}
            className={`absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full ${x.oneSided ? "border border-flat bg-transparent" : "bg-sky"}`}
            style={{ left: `${at(x.perM) * 100}%` }}
            title={`${x.perM >= 0 ? "paid" : "earned"} $${Math.round(Math.abs(x.perM))} per $1M${x.oneSided ? " · one-sided (a bet)" : ""}`}
          />
        ))}
        {others.map((o) => (
          <span
            key={o.label}
            className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-chart"
            style={{ left: `${at(o.perM) * 100}%` }}
            title={`${o.label} · ≈ $${Math.round(o.perM)} per $1M`}
          />
        ))}
        {you != null && (
          <span className="absolute top-0 -translate-x-1/2" style={{ left: `${at(you) * 100}%` }} title={`this book · $${Math.round(you)} per $1M${youMeasured ? " · measured" : " · estimate"}`}>
            <Car tone="papaya" size={18} />
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 text-[9px] tabular-nums text-flat-dim">
        <span>{lo < 0 ? `earned $${Math.round(-lo)}` : "$0"}</span>
        <span className="flex flex-wrap items-center gap-x-2">
          {you != null && <span className="text-papaya">you ${Math.round(you)}{youMeasured ? " ✓" : " ≈"}</span>}
          {peers.length > 0 && (
            <span>
              <span className="mr-0.5 inline-block h-[7px] w-[7px] rounded-full bg-sky align-middle" />
              both ways
            </span>
          )}
          {peers.some((x) => x.oneSided) && (
            <span>
              <span className="mr-0.5 inline-block h-[7px] w-[7px] rounded-full border border-flat align-middle" />
              one-sided
            </span>
          )}
          {others.length > 0 && (
            <span className="text-chart">
              <span className="mr-0.5 inline-block h-[7px] w-[7px] rotate-45 bg-chart align-middle" />
              {others.map((o) => o.label).join(", ")}
            </span>
          )}
        </span>
        <span>paid ${Math.round(hi)}</span>
      </div>
    </div>
  );
}

/* ── ⚖ THE LEAN · how far a "hedged" set of positions really points one way,
   against the size of one trade (the band it is allowed to wander in) ─── */
export function LeanMeter({ leanUsd, clipUsd }: { leanUsd: number | null; clipUsd: number }) {
  if (leanUsd == null || !(clipUsd > 0)) return <span className="text-[10px] text-flat">reading the lean…</span>;
  const span = Math.max(2 * clipUsd, Math.abs(leanUsd) * 1.2);
  const at = (v: number) => Math.min(1, Math.max(0, 0.5 + v / (2 * span)));
  const over = Math.abs(leanUsd) > clipUsd;
  return (
    <div className="w-full">
      <div className="relative h-[10px] w-full border border-steel bg-ink" role="img" aria-label={`leaning ${leanUsd >= 0 ? "long" : "short"} $${Math.round(Math.abs(leanUsd))}, one trade is $${Math.round(clipUsd)}`}>
        <div className="absolute top-0 h-full bg-chart/20" style={{ left: `${at(-clipUsd) * 100}%`, width: `${(at(clipUsd) - at(-clipUsd)) * 100}%` }} />
        <div className="absolute top-[-2px] h-[12px] w-px bg-bone/60" style={{ left: "50%" }} />
        <div className={`absolute top-[-3px] h-[14px] w-[3px] -translate-x-1/2 ${over ? "bg-amber" : "bg-chart"}`} style={{ left: `${at(leanUsd) * 100}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-flat-dim">
        <span>short</span>
        <span className={over ? "font-bold text-amber" : ""}>
          lean {leanUsd >= 0 ? "+" : "−"}${Math.abs(leanUsd).toFixed(0)} · one trade ${Math.round(clipUsd)}
        </span>
        <span>long</span>
      </div>
    </div>
  );
}

/* ── 📈 THE CLIMB · a book's meter over time: it opens in the red (the whole
   round trip charged up front), funding lifts it, it crosses $0, everything
   after is profit · drawn so the red opening is never a surprise ───────── */
export function Climb({
  start,
  startLikely,
  perDay,
  width = 260,
  height = 58,
}: {
  /** the meter the moment both legs fill (≤ 0) */
  start: number;
  /** …if the resting orders fill */
  startLikely?: number | null;
  /** funding per day (+ = paid to you) */
  perDay: number;
  width?: number;
  height?: number;
}) {
  const crossH = perDay > 0 ? (-start / perDay) * 24 : null;
  const horizonH = Math.max(6, Math.min(24 * 14, crossH != null ? crossH * 1.7 : 48));
  const end = start + (perDay * horizonH) / 24;
  const endLikely = startLikely != null ? startLikely + (perDay * horizonH) / 24 : null;
  const vals = [start, end, 0, ...(startLikely != null ? [startLikely, endLikely as number] : [])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pad = 4;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  const x = (h: number) => (h / horizonH) * width;
  const hrs = (h: number) => (h < 48 ? `${Math.ceil(h)}h` : `${(h / 24).toFixed(1)} days`);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[360px]" role="img" aria-label={`opens at ${signedUsd(start)}${crossH != null ? `, crosses $0 in about ${hrs(crossH)}` : ""}`}>
        {/* the red below $0, the green above */}
        <rect x={0} y={y(0)} width={width} height={Math.max(0, height - y(0))} fill="var(--blood)" opacity={0.08} />
        <rect x={0} y={0} width={width} height={Math.max(0, y(0))} fill="var(--chart)" opacity={0.06} />
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--steel)" strokeWidth={1} />
        {startLikely != null && endLikely != null && (
          <line x1={x(0)} y1={y(startLikely)} x2={x(horizonH)} y2={y(endLikely)} stroke="var(--chart)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
        )}
        <line x1={x(0)} y1={y(start)} x2={x(horizonH)} y2={y(end)} stroke={perDay > 0 ? "var(--chart)" : "var(--blood)"} strokeWidth={2} strokeLinecap="round" />
        <circle cx={x(0)} cy={y(start)} r={3} fill="var(--amber)" />
        {crossH != null && crossH <= horizonH && <circle cx={x(crossH)} cy={y(0)} r={3.2} fill="var(--bone)" />}
      </svg>
      <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[9.5px] tabular-nums text-flat">
        <span>
          opens <b className="text-amber">{signedUsd(start)}</b>
          {startLikely != null && startLikely > start + 0.005 ? <span className="text-flat-dim"> ({signedUsd(startLikely)} if rests fill)</span> : null}
        </span>
        <span>{crossH != null ? <>$0 in ≈ <b className="text-bone">{hrs(crossH)}</b></> : <b className="text-blood">funding is not paying this side</b>}</span>
        <span>
          {hrs(horizonH)}: <b className={end >= 0 ? "text-chart" : "text-blood"}>{signedUsd(end)}</b>
        </span>
      </div>
    </div>
  );
}

/* ── ⛽ PER $1M · what a million of volume costs, on the app's one scale ───
   green under $100, amber to $300 (about what volume bots and market makers
   pay — ~2.5–3bps), red beyond · a road that paid you parks the needle at
   zero, in green. ONE scale for rides, desk books, routes and venues: the
   ride surfaces used 60/150 and the desk and route surfaces 300/800, so the
   same route read green on one screen and amber on the next. */
export function Per1M({ cost, width = 64, top = 500 }: { cost: number | null | undefined; width?: number; top?: number }) {
  if (cost == null) return null;
  const at = Math.min(0.985, Math.max(0.015, cost / top));
  const tone = cost <= PER1M_GOOD ? "bg-chart" : cost <= PER1M_OK ? "bg-amber" : "bg-blood";
  return (
    <span
      className="relative inline-block h-[7px] shrink-0 border border-steel bg-ink align-middle"
      style={{ width }}
      role="img"
      aria-label={cost < 0 ? `paid you $${Math.round(-cost)} per $1M` : `$${Math.round(cost)} per $1M`}
    >
      <span className="absolute top-0 h-full bg-chart/25" style={{ left: 0, width: `${(PER1M_GOOD / top) * 100}%` }} />
      <span className="absolute top-0 h-full bg-amber/25" style={{ left: `${(PER1M_GOOD / top) * 100}%`, width: `${((PER1M_OK - PER1M_GOOD) / top) * 100}%` }} />
      <span className={`absolute top-[-2px] h-[9px] w-[3px] -translate-x-1/2 ${tone}`} style={{ left: `${at * 100}%` }} />
    </span>
  );
}

/* ── ▥ SHARE BAR · where a total sits, one segment per place ──────────────
   Balances are neither money in nor money out, so this bar wears no money
   colours: the biggest share in papaya (where most of it is), the rest in
   alternating cream, and a place that did not answer as a hatched stub —
   drawn, never counted as $0. */
export function ShareBar({
  parts,
  height = 8,
}: {
  parts: { key: string; label: string; value: number | null }[];
  height?: number;
}) {
  const known = parts.filter((p) => p.value != null && p.value > 0) as { key: string; label: string; value: number }[];
  const silent = parts.filter((p) => p.value == null);
  const total = known.reduce((a, p) => a + p.value, 0);
  if (!(total > 0) && !silent.length) return null;
  const sorted = [...known].sort((a, b) => b.value - a.value);
  return (
    <div
      className="flex w-full gap-px border border-steel bg-ink"
      style={{ height }}
      role="img"
      aria-label={[...sorted.map((p) => `${p.label} ${usd(p.value)}`), ...silent.map((p) => `${p.label} did not answer`)].join(", ")}
    >
      {sorted.map((p, i) => (
        <span
          key={p.key}
          className={`h-full ${i === 0 ? "bg-papaya/80" : i % 2 ? "bg-bone/60" : "bg-bone/35"}`}
          style={{ flexGrow: Math.max(0.5, (p.value / total) * 100), flexBasis: 0 }}
          title={`${p.label} ${usd(p.value)} · ${Math.round((p.value / total) * 100)}%`}
        />
      ))}
      {silent.map((p) => (
        <span
          key={p.key}
          className="h-full w-[6px] shrink-0 bg-[repeating-linear-gradient(135deg,var(--steel)_0_2px,transparent_2px_4px)]"
          title={`${p.label} did not answer · not $0`}
        />
      ))}
    </div>
  );
}
