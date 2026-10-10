"use client";
/**
 * useRide · wires a market feed, an executor and (optionally) Passenger into
 * one RideEngine, and keeps the receipt when the ride ends.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RideEngine, PaperExecutor, freshState, netPnl, type Band, type Rails, type RideState, type Executor } from "./engine";
import { Passenger, readSignal } from "./passenger";
import { saveReceipt, type Receipt } from "./receipts";
import type { MarketView } from "@/lib/perpl/market";

export type RideMode = "practice" | "live";

export interface UseRide {
  state: RideState;
  signal: { trend: number; flow: number; signal: number };
  net: number;
  receipt: Receipt | null;
  start: (exec: Executor | null) => void;
  setBand: (b: Band) => void;
  stop: () => Promise<void>;
  dismiss: () => void;
}

export function useRide(feed: MarketView, opts: { asset: string; rails: Rails; autopilot: boolean; owner: string | null }): UseRide {
  const engine = useRef<RideEngine | null>(null);
  const passenger = useRef(new Passenger());
  const [state, setState] = useState<RideState>(freshState());
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const signal = readSignal(feed.series, feed.tape);

  const start = useCallback((exec: Executor | null) => {
    const o = optsRef.current;
    const e = new RideEngine(exec ?? new PaperExecutor(feedRef.current.market?.takerFeeBps ?? 3.45), o.rails);
    passenger.current = new Passenger();
    e.subscribe((s) => {
      setState(s);
      if (s.status === "ended" && engine.current === e) {
        const r = saveReceipt(s, {
          asset: o.asset,
          mode: e.exec.kind === "paper" ? "practice" : "live",
          autopilot: o.autopilot,
          rails: e.rails,
          owner: o.owner,
          lastMid: feedRef.current.mid,
        });
        setReceipt(r);
      }
    });
    engine.current = e;
    setReceipt(null);
    e.start();
  }, []);

  // the heartbeat: every feed sample drives one engine tick
  useEffect(() => {
    const e = engine.current;
    if (!e || e.state.status !== "riding" || !feed.mid) return;
    if (opts.autopilot) {
      const sig = readSignal(feed.series, feed.tape);
      const want = passenger.current.decide(sig.signal, e.state.band);
      if (want !== e.state.target) e.setTarget(want);
    }
    void e.tick(feed.mid, opts.autopilot ? "passenger" : "player");
  }, [feed.series, feed.mid, feed.tape, opts.autopilot]);

  const setBand = useCallback((b: Band) => engine.current?.setTarget(b), []);

  const stop = useCallback(async () => {
    const e = engine.current;
    if (e && e.state.status === "riding") await e.end(feedRef.current.mid, "rider");
  }, []);

  // never leave a position open behind an unmounted screen
  useEffect(
    () => () => {
      const e = engine.current;
      if (e && e.state.status === "riding") void e.end(feedRef.current.mid, "left");
    },
    [],
  );

  const dismiss = useCallback(() => {
    setReceipt(null);
    setState(freshState());
    engine.current = null;
  }, []);

  return { state, signal, net: netPnl(state, feed.mid), receipt, start, setBand, stop, dismiss };
}
