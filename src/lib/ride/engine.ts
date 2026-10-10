/**
 * Ride engine · turns "where the surfer is on the wave" into real positions.
 *
 *   CREST  (+1) = LONG   · you win when price rises
 *   LINE   ( 0) = FLAT   · no position
 *   TROUGH (−1) = SHORT  · you win when price falls
 *
 * The player (or Passenger, the autopilot) only ever sets a TARGET band. The
 * engine reconciles the real position toward it one order at a time, behind
 * the safety rails:
 *
 *   · clip cap     every position is the same capped notional, never more
 *   · throttle     a minimum gap between orders, so a twitchy thumb can't churn fees
 *   · stop         a position that moves `stopPct` against its entry is closed (wipeout)
 *   · loss limit   the ride ends itself once net P&L reaches −lossLimitUsd
 *   · timer        the ride ends itself at `durationSec` and flattens
 *   · flatten      every exit path (end, pause, error, unmount) closes the position
 *
 * Executors are swappable: PaperExecutor fills at the live mid for practice,
 * PerplExecutor sends real IOC orders to Perpl on Monad.
 */

export type Band = -1 | 0 | 1;

export interface Fill {
  at: number;
  action: "open-long" | "open-short" | "close";
  px: number;
  size: number;
  notional: number;
  fee: number;
  /** realised P&L of a close, before fees */
  pnl?: number;
  reason?: "player" | "passenger" | "stop" | "end" | "loss-limit";
  txid?: string;
  block?: number;
}

export interface ExecResult {
  ok: boolean;
  px?: number;
  size?: number;
  fee?: number;
  /** venue-reported net P&L of a close (price P&L − fees). When present it
   *  replaces the engine's own price arithmetic for that close. */
  netPnl?: number;
  txid?: string;
  block?: number;
  error?: string;
}

export interface Executor {
  readonly kind: "paper" | "perpl";
  open(side: 1 | -1, usd: number, mid: number): Promise<ExecResult>;
  close(mid: number): Promise<ExecResult>;
}

export interface Rails {
  clipUsd: number;
  stopPct: number;
  lossLimitUsd: number;
  durationSec: number;
  throttleMs: number;
}

export const DEFAULT_RAILS: Rails = {
  clipUsd: 10,
  stopPct: 0.6,
  lossLimitUsd: 3,
  durationSec: 180,
  throttleMs: 1500,
};

/** Hard ceilings the UI cannot exceed, whatever the sliders say. */
export const RAIL_LIMITS = { clipUsdMax: 100, lossLimitMax: 25, durationMax: 900 };

export interface RideState {
  status: "idle" | "riding" | "ended";
  target: Band;
  band: Band;
  busy: boolean;
  entryPx: number;
  size: number; // signed base size
  realized: number;
  fees: number;
  volume: number;
  fills: Fill[];
  wipeouts: number;
  peak: number;
  maxDrawdown: number;
  startedAt: number;
  endedAt: number;
  endReason: string;
  lastError: string;
}

export const freshState = (): RideState => ({
  status: "idle",
  target: 0,
  band: 0,
  busy: false,
  entryPx: 0,
  size: 0,
  realized: 0,
  fees: 0,
  volume: 0,
  fills: [],
  wipeouts: 0,
  peak: 0,
  maxDrawdown: 0,
  startedAt: 0,
  endedAt: 0,
  endReason: "",
  lastError: "",
});

export const unrealized = (s: RideState, mid: number) => (s.size && mid ? s.size * (mid - s.entryPx) : 0);
export const netPnl = (s: RideState, mid: number) => s.realized + unrealized(s, mid) - s.fees;

export class RideEngine {
  state: RideState = freshState();
  private lastOrderAt = 0;
  private listeners = new Set<(s: RideState) => void>();

  constructor(
    readonly exec: Executor,
    public rails: Rails,
  ) {
    this.rails = clampRails(rails);
  }

  subscribe(fn: (s: RideState) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    // listeners get a copy; the engine keeps mutating its own object, which
    // in-flight orders hold a reference to
    const snap = { ...this.state, fills: [...this.state.fills] };
    for (const l of this.listeners) l(snap);
  }

  start() {
    this.state = { ...freshState(), status: "riding", startedAt: Date.now() };
    this.lastOrderAt = 0;
    this.emit();
  }

  setTarget(b: Band) {
    if (this.state.status !== "riding") return;
    this.state.target = b;
    this.emit();
  }

  /** Call on every price tick. Runs the rails, then moves one step toward target. */
  async tick(mid: number, who: "player" | "passenger" = "player") {
    const s = this.state;
    if (s.status !== "riding" || !mid) return;

    // rails that end the ride
    const net = netPnl(s, mid);
    s.peak = Math.max(s.peak, net);
    s.maxDrawdown = Math.max(s.maxDrawdown, s.peak - net);
    if (net <= -this.rails.lossLimitUsd) return this.end(mid, "loss-limit");
    if (Date.now() - s.startedAt >= this.rails.durationSec * 1000) return this.end(mid, "end");

    if (s.busy) return;

    // the stop: a position that moved stopPct against entry is a wipeout
    if (s.size && s.entryPx) {
      const move = ((mid - s.entryPx) / s.entryPx) * 100 * Math.sign(s.size);
      if (move <= -this.rails.stopPct) {
        s.wipeouts += 1;
        s.target = 0;
        await this.closeNow(mid, "stop");
        return;
      }
    }

    if (s.target === s.band) return;
    if (Date.now() - this.lastOrderAt < this.rails.throttleMs) return;

    if (s.band !== 0) await this.closeNow(mid, who);
    else await this.openNow(s.target as 1 | -1, mid, who);
  }

  private async openNow(side: 1 | -1, mid: number, reason: Fill["reason"]) {
    const s = this.state;
    s.busy = true;
    this.lastOrderAt = Date.now();
    this.emit();
    const r = await this.exec.open(side, this.rails.clipUsd, mid).catch((e) => ({ ok: false, error: String(e) }) as ExecResult);
    s.busy = false;
    if (r.ok && r.size) {
      const px = r.px || mid;
      s.size = side * r.size;
      s.entryPx = px;
      s.band = side;
      s.fees += r.fee ?? 0;
      s.volume += r.size * px;
      s.fills.push({
        at: Date.now(),
        action: side > 0 ? "open-long" : "open-short",
        px,
        size: r.size,
        notional: r.size * px,
        fee: r.fee ?? 0,
        reason,
        txid: r.txid,
        block: r.block,
      });
      s.lastError = "";
    } else {
      // a refused open drops the target back to flat so we don't hammer the venue
      s.target = 0;
      s.lastError = r.error ?? "order refused";
    }
    this.emit();
  }

  private async closeNow(mid: number, reason: Fill["reason"]) {
    const s = this.state;
    if (!s.size) {
      s.band = 0;
      return;
    }
    s.busy = true;
    this.lastOrderAt = Date.now();
    this.emit();
    const r = await this.exec.close(mid).catch((e) => ({ ok: false, error: String(e) }) as ExecResult);
    s.busy = false;
    if (r.ok) {
      const px = r.px || mid;
      const size = Math.abs(s.size);
      const pnl = r.netPnl ?? s.size * (px - s.entryPx);
      s.realized += pnl;
      s.fees += r.fee ?? 0;
      s.volume += size * px;
      s.fills.push({
        at: Date.now(),
        action: "close",
        px,
        size,
        notional: size * px,
        fee: r.fee ?? 0,
        pnl,
        reason,
        txid: r.txid,
        block: r.block,
      });
      s.size = 0;
      s.entryPx = 0;
      s.band = 0;
      s.lastError = "";
    } else {
      s.lastError = r.error ?? "close refused";
    }
    this.emit();
  }

  /** End the ride and flatten. Safe to call more than once. */
  async end(mid: number, reason = "end") {
    const s = this.state;
    if (s.status === "ended") return;
    s.target = 0;
    s.endReason = reason;
    // wait out an in-flight order, then flatten
    for (let i = 0; i < 40 && s.busy; i++) await new Promise((r) => setTimeout(r, 250));
    if (s.size) await this.closeNow(mid, reason === "loss-limit" ? "loss-limit" : "end");
    if (s.size) {
      // one retry: a failed flatten must never be silent
      await new Promise((r) => setTimeout(r, 1200));
      await this.closeNow(mid, "end");
    }
    s.status = "ended";
    s.endedAt = Date.now();
    this.emit();
  }
}

export function clampRails(r: Rails): Rails {
  return {
    clipUsd: Math.min(Math.max(r.clipUsd, 1), RAIL_LIMITS.clipUsdMax),
    stopPct: Math.min(Math.max(r.stopPct, 0.1), 5),
    lossLimitUsd: Math.min(Math.max(r.lossLimitUsd, 0.5), RAIL_LIMITS.lossLimitMax),
    durationSec: Math.min(Math.max(r.durationSec, 30), RAIL_LIMITS.durationMax),
    throttleMs: Math.max(r.throttleMs, 800),
  };
}

/** Practice executor · fills at the live touch with Perpl's taker fee, no money moves. */
export class PaperExecutor implements Executor {
  readonly kind = "paper" as const;
  private pos = 0;
  constructor(private takerBps = 3.45) {}
  async open(side: 1 | -1, usd: number, mid: number): Promise<ExecResult> {
    const size = usd / mid;
    this.pos = side * size;
    return { ok: true, px: mid, size, fee: (usd * this.takerBps) / 1e4 };
  }
  async close(mid: number): Promise<ExecResult> {
    const size = Math.abs(this.pos);
    this.pos = 0;
    return { ok: true, px: mid, size, fee: (size * mid * this.takerBps) / 1e4 };
  }
}
