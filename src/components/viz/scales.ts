/**
 * The app's shared scales · plain functions and numbers, no React, no
 * "use client". Server pages import from here; client components may import
 * from here or from Viz.tsx, which re-exports all of it. Calling a function
 * exported by a "use client" module on the server throws, which is how
 * /discoveries once returned a 500.
 */

/** a dollar figure with its sign glued on (a word joiner keeps "−" off a line end) */
export const signedUsd = (n: number, d = 2) => `${n >= 0 ? "+" : "−"}\u2060$${Math.abs(n).toFixed(d)}`;
export const usd = (n: number, d = 2) => `$${Math.abs(n).toFixed(d)}`;

/* how far to liquidation · amber under 25% away, red under 10%, everywhere a position shows */
export const LIQ_DANGER = 10;
export const LIQ_WATCH = 25;
/** "bad" under 10% away, "warn" under 25%, else "good" · null = unknown */
export const liqTone = (awayPct: number | null | undefined): "bad" | "warn" | "good" | null =>
  awayPct == null || !Number.isFinite(awayPct) ? null : awayPct < LIQ_DANGER ? "bad" : awayPct < LIQ_WATCH ? "warn" : "good";

/* the one cost scale, $ per $1M of volume · green under $100, amber to $300
   (about what volume bots and market makers pay), red beyond */
export const PER1M_GOOD = 100;
export const PER1M_OK = 300;
/** the scale in words · for titles and legends, so the copy never drifts from the numbers */
export const PER1M_SCALE_WORDS = "green under $100 · amber to $300, about what volume bots pay · red beyond";
/** the same bands as a fill colour */
export const per1mBg = (c: number | null | undefined) =>
  c == null ? "bg-flat/50" : c <= PER1M_GOOD ? "bg-chart" : c <= PER1M_OK ? "bg-amber" : "bg-blood";
export const per1mTone = (c: number | null | undefined) =>
  c == null ? "text-flat" : c <= PER1M_GOOD ? "text-chart" : c <= PER1M_OK ? "text-amber" : "text-blood";
/** "$84" when it cost, "+$12" when the road paid you · null → "—" */
export const per1mText = (c: number | null | undefined) =>
  c == null ? "—" : c < 0 ? `+$${Math.round(-c).toLocaleString()}` : `$${c < 1 ? c.toFixed(2) : Math.round(c).toLocaleString()}`;
