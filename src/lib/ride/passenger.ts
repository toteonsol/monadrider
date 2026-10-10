/**
 * Passenger · the hands-off rider. Reads the same wave the player sees and
 * picks a band; the engine's rails still decide size, stops and when to quit.
 *
 * Signal = trend + flow, both bounded to [-1, 1]:
 *   · trend  fast EMA vs slow EMA of the sampled mid, in basis points,
 *            squashed so a few bps of drift reads as conviction
 *   · flow   signed taker volume on Perpl's tape over the last 30s
 *            (buys − sells) / (buys + sells)
 *
 * Entry needs |signal| ≥ enter; once in, it holds until the signal fades
 * below `exit` or flips (hysteresis, so it does not chatter on noise).
 * A minimum hold keeps it from paying taker fees to flip every tick.
 */
import type { Band } from "./engine";
import type { TapeTrade } from "@/lib/perpl/market";

export interface PassengerParams {
  enter: number;
  exit: number;
  minHoldMs: number;
}

export const DEFAULT_PASSENGER: PassengerParams = { enter: 0.45, exit: 0.12, minHoldMs: 8000 };

function ema(xs: number[], n: number): number {
  if (!xs.length) return 0;
  const k = 2 / (n + 1);
  let e = xs[0];
  for (let i = 1; i < xs.length; i++) e += (xs[i] - e) * k;
  return e;
}

export function readSignal(series: number[], tape: TapeTrade[], now = Date.now()) {
  const tail = series.slice(-120);
  const mid = tail[tail.length - 1] || 0;
  let trend = 0;
  if (mid && tail.length >= 30) {
    const bps = ((ema(tail, 10) - ema(tail, 60)) / mid) * 1e4;
    trend = Math.tanh(bps / 4);
  }
  let buy = 0;
  let sell = 0;
  for (const t of tape) {
    if (now - t.t > 30_000) continue;
    const usd = t.px * t.size;
    if (t.side === "buy") buy += usd;
    else sell += usd;
  }
  const flow = buy + sell > 0 ? (buy - sell) / (buy + sell) : 0;
  const signal = Math.max(-1, Math.min(1, 0.7 * trend + 0.3 * flow));
  return { trend, flow, signal };
}

export class Passenger {
  private heldSince = 0;
  private current: Band = 0;

  constructor(private p: PassengerParams = DEFAULT_PASSENGER) {}

  /** Decide the band for this tick. `band` is where the engine actually is. */
  decide(signal: number, band: Band, now = Date.now()): Band {
    if (band !== this.current) {
      this.current = band;
      this.heldSince = now;
    }
    const held = now - this.heldSince;
    if (band === 0) {
      if (signal >= this.p.enter) return 1;
      if (signal <= -this.p.enter) return -1;
      return 0;
    }
    if (held < this.p.minHoldMs) return band;
    // in a position: leave on fade or on a flip
    if (band === 1 && signal < this.p.exit) return signal <= -this.p.enter ? -1 : 0;
    if (band === -1 && signal > -this.p.exit) return signal >= this.p.enter ? 1 : 0;
    return band;
  }
}
