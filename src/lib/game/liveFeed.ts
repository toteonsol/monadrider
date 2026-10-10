/**
 * LiveFeed · Perpl's live order flow on Monad → the game's mid + flow signal.
 *
 * Same contract the RIDE / SURFER / PULSE worlds were built against (mid,
 * flow ∈ [-1, 1], funding, connected, onTape, onTrade), now fed by Perpl's
 * market-data socket through our relay instead of another chain:
 *
 *   order-book@<market>  → OFI (order-flow imbalance at the touch) + OBI (top-10 depth)
 *   trades@<market>      → signed taker flow + whale prints, each a Monad tx
 *
 * combined and normalised into `flow` exactly the way the worlds expect, so
 * buyers surging still means dolphins on the lip.
 *
 * The worlds construct `new LiveFeed("ETH")`; the asset the rider picked
 * (setRideAsset) overrides that, so every world rides the chosen Perpl market.
 */
import { PERPL, fetchPerplContext, type PerplMarket } from "@/lib/perpl/config";

export interface FeedTape {
  msg: string;
  cls: "sell" | "buy" | "";
}

export interface MarketFeed {
  connected: boolean;
  mid: number;
  flow: number;
  /** hourly funding rate · + = longs pay shorts */
  funding: number;
}

let rideAsset: string | null = null;
/** The Perpl market every world rides (MON, BTC, ETH, SOL, HYPE…). */
export const setRideAsset = (a: string) => {
  rideAsset = a;
};
export const getRideAsset = () => rideAsset ?? "MON";

function makeNormalizer(halfLife: number) {
  let ema = 0;
  const k = 2 / (halfLife + 1);
  return (x: number) => {
    ema += (Math.abs(x) - ema) * k;
    return ema > 1e-9 ? Math.tanh(x / (ema * 2.2)) : 0;
  };
}

const COMBINE = { tradeflow: 0.1, ofi: 0.45, obi: 0.45, gain: 1.25 };

type Level = { p: number; s: number; o: number };
type Msg = Record<string, unknown>;

export class LiveFeed implements MarketFeed {
  coin: string;
  mid = 0;
  flow = 0;
  funding = 0;
  connected = false;
  onTrade?: (signedSize: number, scale: number) => void;

  private market: PerplMarket | null = null;
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private obi = 0;
  private ofi = 0;
  private prevBB: number | null = null;
  private prevBA = 0;
  private prevBBs = 0;
  private prevBAs = 0;
  private trades: { t: number; v: number }[] = [];
  private normOFI = makeNormalizer(120);
  private normTF = makeNormalizer(120);
  private lastData = 0;
  private lastTape = 0;
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private onTape?: (e: FeedTape) => void;

  constructor(coin = "MON", onTape?: (e: FeedTape) => void) {
    this.coin = rideAsset ?? coin;
    this.onTape = onTape;
  }

  async start() {
    if (this.ws || this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      this.connected = Date.now() - this.lastData < 8000;
      this.ofi *= 0.96;
      const f = COMBINE.tradeflow * this.normTF(this.tradeFlow()) + COMBINE.ofi * this.normOFI(this.ofi) + COMBINE.obi * this.obi;
      this.flow = Math.max(-1, Math.min(1, f * COMBINE.gain));
    }, 100);
    try {
      const ctx = await fetchPerplContext();
      this.market = ctx.markets[this.coin] ?? ctx.markets.MON ?? null;
      if (this.market) {
        this.coin = this.market.name;
        this.mid = this.market.mid;
        this.lastData = Date.now();
      }
    } catch {
      /* the socket below still tries */
    }
    this.connect();
  }

  private connect() {
    if (this.stopped || !this.market || typeof WebSocket === "undefined") return;
    const m = this.market;
    const ws = new WebSocket(`${PERPL.wsUrl}/ws/v1/market-data${PERPL.wsQuery}`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          mt: 5,
          subs: [
            { stream: `order-book@${m.id}`, subscribe: true },
            { stream: `trades@${m.id}`, subscribe: true },
          ],
        }),
      );
    };
    ws.onmessage = (ev) => {
      let d: Msg;
      try {
        d = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (d.mt === 15 || d.mt === 16) this.onBook(d, d.mt === 15);
      else if (d.mt === 17 || d.mt === 18) this.onTrades(d, d.mt === 17);
    };
    ws.onclose = () => {
      this.ws = null;
      this.connected = false;
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  private onBook(d: Msg, snapshot: boolean) {
    const m = this.market!;
    const ps = 10 ** m.priceDecimals;
    const ss = 10 ** m.sizeDecimals;
    if (snapshot) {
      this.bids.clear();
      this.asks.clear();
    }
    for (const [side, book] of [
      [d.bid, this.bids],
      [d.ask, this.asks],
    ] as [Level[] | undefined, Map<number, number>][]) {
      for (const l of side ?? []) {
        const p = l.p / ps;
        if (!l.o || !l.s) book.delete(p);
        else book.set(p, l.s / ss);
      }
    }
    if (!this.bids.size || !this.asks.size) return;
    const bidPx = [...this.bids.keys()].sort((a, b) => b - a);
    const askPx = [...this.asks.keys()].sort((a, b) => a - b);
    const bb = bidPx[0];
    const ba = askPx[0];
    if (!(ba > bb)) return; // crossed mid-update; wait for the next frame
    const bbs = this.bids.get(bb)!;
    const bas = this.asks.get(ba)!;
    let bd = 0;
    let ad = 0;
    for (const p of bidPx.slice(0, 10)) bd += this.bids.get(p)!;
    for (const p of askPx.slice(0, 10)) ad += this.asks.get(p)!;
    this.obi = (bd - ad) / (bd + ad + 1e-9);
    if (this.prevBB !== null) {
      let e = 0;
      if (bb > this.prevBB) e += bbs;
      else if (bb < this.prevBB) e -= this.prevBBs;
      else e += bbs - this.prevBBs;
      if (ba < this.prevBA) e -= bas;
      else if (ba > this.prevBA) e += this.prevBAs;
      else e -= bas - this.prevBAs;
      this.ofi = this.ofi * 0.93 + e;
    }
    this.prevBB = bb;
    this.prevBA = ba;
    this.prevBBs = bbs;
    this.prevBAs = bas;
    this.mid = (bb + ba) / 2;
    this.lastData = Date.now();
  }

  private onTrades(d: Msg, snapshot: boolean) {
    // the opening snapshot is history; only live prints move the flow
    if (snapshot || !Array.isArray(d.d)) return;
    const m = this.market!;
    const ss = 10 ** m.sizeDecimals;
    const t = Date.now();
    let burst = 0;
    const scale0 = this.tradeScale();
    for (const x of d.d as Msg[]) {
      const v = (Number(x.s) / ss) * (Number(x.sd) === 2 ? -1 : 1);
      this.trades.push({ t, v });
      burst += v;
      this.onTrade?.(v, scale0);
    }
    while (this.trades.length > 4000) this.trades.shift();
    this.lastData = t;
    const thresh = this.tradeScale() * 3;
    if (Math.abs(burst) > thresh && t - this.lastTape > 1400) {
      this.lastTape = t;
      this.onTape?.(
        burst < 0 ? { msg: "aggressive sells hit Perpl's book", cls: "sell" } : { msg: "breakout buying on Perpl's book", cls: "buy" },
      );
    }
  }

  private tradeFlow() {
    const now = Date.now();
    let s = 0;
    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (now - this.trades[i].t > 1000) break;
      s += this.trades[i].v;
    }
    return s;
  }

  private tradeScale() {
    if (!this.trades.length) return 1;
    let s = 0;
    const n = Math.min(50, this.trades.length);
    for (let i = this.trades.length - n; i < this.trades.length; i++) s += Math.abs(this.trades[i].v);
    return s / n || 1;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
