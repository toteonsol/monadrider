"use client";
/**
 * Live Perpl market feed · the wave's source of truth.
 *
 * One market-data socket (through our relay) carries the exchange-wide
 * `market-state` stream and the selected market's `trades` stream. The wave is a
 * ring of mids sampled on a steady clock, seeded from 1-minute candles so it is
 * never flat on open. Every trade on the tape carries the Monad tx that settled
 * it, so the tape doubles as live onchain proof.
 */
import { useEffect, useRef, useState } from "react";
import { PERPL, fetchPerplContext, type PerplMarket } from "./config";

export interface TapeTrade {
  px: number;
  size: number;
  side: "buy" | "sell";
  txid?: string;
  block?: number;
  t: number;
}

export interface MarketView {
  connected: boolean;
  market: PerplMarket | null;
  mid: number;
  bid: number;
  ask: number;
  /** price 24h ago, for the day change */
  prev: number;
  /** mids, oldest → newest, one per SAMPLE_MS */
  series: number[];
  tape: TapeTrade[];
  headBlock: number;
}

const SAMPLE_MS = 500;
const SERIES_LEN = 240; // two minutes of wave at 2 samples a second
const TAPE_LEN = 30;

type Msg = Record<string, unknown>;

async function seedFromCandles(m: PerplMarket): Promise<number[]> {
  const to = Date.now();
  const from = to - 60 * 60_000;
  try {
    const r = await fetch(`/api/perpl/market/${m.id}/candles/60/${from}-${to}${PERPL.isTestnet ? "?testnet=true" : ""}`);
    const d = (await r.json()) as { d?: { c: number }[] };
    const scale = 10 ** m.priceDecimals;
    return (d.d ?? []).map((c) => c.c / scale).filter((x) => x > 0);
  } catch {
    return [];
  }
}

/** Stretch a short candle history into SERIES_LEN points so the opening wave has shape. */
function resample(xs: number[], n: number): number[] {
  if (xs.length < 2) return xs;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * (xs.length - 1);
    const a = Math.floor(f);
    const b = Math.min(xs.length - 1, a + 1);
    out.push(xs[a] + (xs[b] - xs[a]) * (f - a));
  }
  return out;
}

export function useMarketFeed(asset: string): MarketView {
  const [view, setView] = useState<MarketView>({
    connected: false,
    market: null,
    mid: 0,
    bid: 0,
    ask: 0,
    prev: 0,
    series: [],
    tape: [],
    headBlock: 0,
  });
  const live = useRef({ mid: 0, bid: 0, ask: 0, prev: 0, head: 0 });

  useEffect(() => {
    let dead = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let series: number[] = [];
    let tape: TapeTrade[] = [];
    let market: PerplMarket | null = null;
    let connected = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      if (dead) return;
      const l = live.current;
      setView({
        connected,
        market,
        mid: l.mid,
        bid: l.bid,
        ask: l.ask,
        prev: l.prev,
        series,
        tape,
        headBlock: l.head,
      });
    };

    const onMsg = (m: Msg) => {
      if (!market) return;
      const scale = 10 ** market.priceDecimals;
      if (m.mt === 9 && m.d && typeof m.d === "object") {
        const st = (m.d as Record<string, Msg>)[String(market.id)];
        if (st) {
          const l = live.current;
          if (st.mid) l.mid = Number(st.mid) / scale;
          if (st.bid) l.bid = Number(st.bid) / scale;
          if (st.ask) l.ask = Number(st.ask) / scale;
          if (st.prv) l.prev = Number(st.prv) / scale;
        }
        if (typeof m.sn === "number") live.current.head = Math.max(live.current.head, m.sn);
      } else if ((m.mt === 17 || m.mt === 18) && Array.isArray(m.d)) {
        const sizeScale = 10 ** market.sizeDecimals;
        const fresh = (m.d as Msg[]).map((x) => {
          const at = (x.at ?? {}) as Msg;
          return {
            px: Number(x.p) / scale,
            size: Number(x.s) / sizeScale,
            side: Number(x.sd) === 2 ? "sell" : "buy",
            txid: typeof at.txid === "string" ? at.txid : undefined,
            block: typeof at.b === "number" ? at.b : undefined,
            t: typeof at.t === "number" ? at.t : Date.now(),
          } as TapeTrade;
        });
        tape = [...fresh.reverse(), ...tape].slice(0, TAPE_LEN);
        publish();
      }
    };

    const connect = () => {
      if (dead || !market) return;
      ws = new WebSocket(`${PERPL.wsUrl}/ws/v1/market-data${PERPL.wsQuery}`);
      ws.onopen = () => {
        retry = 0;
        connected = true;
        ws?.send(
          JSON.stringify({
            mt: 5,
            subs: [
              { stream: `market-state@${PERPL.chainId}`, subscribe: true },
              { stream: `trades@${market!.id}`, subscribe: true },
            ],
          }),
        );
        publish();
      };
      ws.onmessage = (ev) => {
        try {
          onMsg(JSON.parse(ev.data as string));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        connected = false;
        publish();
        if (dead) return;
        const d = [1000, 2000, 4000, 8000, 15000][Math.min(retry++, 4)];
        retryTimer = setTimeout(connect, d);
      };
    };

    (async () => {
      const ctx = await fetchPerplContext().catch(() => null);
      if (dead || !ctx) return;
      market = ctx.markets[asset] ?? null;
      if (!market) return;
      live.current = { mid: market.mid, bid: market.bid, ask: market.ask, prev: 0, head: ctx.headBlock };
      const hist = await seedFromCandles(market);
      if (dead) return;
      // the seed is a smoothed hour; the live tail takes over within two minutes
      series = resample([...hist.slice(-30), market.mid].filter(Boolean), SERIES_LEN);
      publish();
      connect();
    })();

    const tick = setInterval(() => {
      const mid = live.current.mid;
      if (!mid) return;
      series = [...series, mid].slice(-SERIES_LEN);
      publish();
    }, SAMPLE_MS);

    return () => {
      dead = true;
      clearInterval(tick);
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [asset]);

  return view;
}
