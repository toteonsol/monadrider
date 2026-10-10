"use client";
/**
 * The live bridge · RIDE, SURFER and PULSE drive real Perpl orders on Monad.
 *
 * Every world speaks the same three refs:
 *   setTargetRef(side)  a lane / band / beat changed: +1 long, 0 flat, −1 short
 *   flattenRef()        the run ended: close everything
 *   realRef             what really happened: volume, fees, fills, pnl, last
 *
 * Behind them sits the RideEngine with the onchain executor: each lane change
 * becomes one execOrder (IOC) transaction from the rider's passkey wallet to
 * Perpl's Exchange, inside the rails (clip cap, stop, max loss, throttle,
 * flatten on every exit). In Passenger mode the autopilot picks the band from
 * Perpl's live order flow and the world just rides along.
 *
 * Practice (not armed) leaves every ref unset, so the worlds play exactly as
 * the free game always has.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RideEngine, DEFAULT_RAILS, netPnl, type Band, type Rails, type RideState } from "./engine";
import { OnchainExecutor } from "./onchainExecutor";
import { Passenger, readSignal } from "./passenger";
import { pushRideTx, takeRideTxids } from "./session";
import { useMarketFeed } from "@/lib/perpl/market";
import { readPosition } from "@/lib/perpl/onchain";
import { publicClient, useMera } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";
import { setRideAsset } from "@/lib/game/liveFeed";
import { setRideAddress } from "./session";
import { saveReceipt, type Receipt } from "./receipts";

export type DriveMode = "turbo" | "passenger";

export interface RealSnapshot {
  volume: number;
  fees: number;
  fills: number;
  pnl: number;
  feesInPnl?: boolean;
  last: string | null;
  note?: string | null;
  asset?: string;
  race?: { volume: number; net: number; targetUsd: number; maxLossUsd: number; startedAt: number | null };
}

const LEVERAGE = 3;

export function useLiveBridge(asset: string) {
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const feed = useMarketFeed(asset);
  const [armed, setArmed] = useState(false);
  const [mode, setMode] = useState<DriveMode>("turbo");
  const [rails, setRails] = useState<Rails>(DEFAULT_RAILS);
  const [state, setState] = useState<RideState | null>(null);
  const [armError, setArmError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const engine = useRef<RideEngine | null>(null);
  const passenger = useRef(new Passenger());

  const setTargetRef = useRef<((side: number) => void) | null>(null);
  const flattenRef = useRef<(() => void) | null>(null);
  const realRef = useRef<RealSnapshot | null>(null);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => setRideAsset(asset), [asset]);

  const marginNeeded = rails.clipUsd / LEVERAGE;
  const ready = {
    wallet: !!mera.address,
    gas: (mera.balances?.mon ?? 0) >= 0.05,
    account: !!perpl.account,
    margin: (perpl.account?.free ?? 0) >= marginNeeded * 1.2,
  };
  const canArm = ready.wallet && ready.gas && ready.account && ready.margin && !!feed.market;

  /** Arm: build the engine and publish the refs the worlds call. */
  const arm = useCallback(async () => {
    setArmError("");
    const m = feedRef.current.market;
    if (!mera.wallet || !perpl.account || !m) return setArmError("Not ready yet: wallet, Perpl account and market feed are needed.");
    const pos = await readPosition(publicClient, m, perpl.account.id).catch(() => null);
    if (pos && pos.side !== 0) {
      return setArmError(`You already hold a ${pos.side > 0 ? "long" : "short"} ${m.name} on Perpl. Close it first so the ride starts flat.`);
    }
    const e = new RideEngine(new OnchainExecutor(publicClient, mera.wallet, m, perpl.account.id, LEVERAGE), rails);
    let seen = 0;
    const autopilot = modeRef.current === "passenger";
    e.subscribe((s) => {
      setState(s);
      if (s.status === "ended" && engine.current === e) {
        setReceipt(saveReceipt(s, { asset: m.name, mode: "live", autopilot, rails: e.rails, owner: mera.address, lastMid: feedRef.current.mid }));
      }
      for (; seen < s.fills.length; seen++) pushRideTx(s.fills[seen].txid);
      const f = s.fills[s.fills.length - 1];
      realRef.current = {
        volume: s.volume,
        fees: s.fees,
        fills: s.fills.length,
        // realised net already carries the closes' fees; open fees ride in `fees`
        pnl: s.realized + (s.size ? s.size * (feedRef.current.mid - s.entryPx) : 0),
        feesInPnl: false,
        asset: m.name,
        last: f ? `${f.action === "close" ? "closed" : f.action === "open-long" ? "long" : "short"} @ ${f.px.toPrecision(5)}` : null,
        note: s.busy ? "sending to Perpl on Monad…" : s.lastError || null,
        race: {
          volume: s.volume,
          net: netPnl(s, feedRef.current.mid),
          targetUsd: rails.clipUsd * 20,
          maxLossUsd: rails.lossLimitUsd,
          startedAt: s.startedAt || null,
        },
      };
    });
    takeRideTxids(); // a fresh trail for this ride
    setReceipt(null);
    setRideAddress(mera.address);
    passenger.current = new Passenger();
    e.start();
    engine.current = e;
    setTargetRef.current = (side: number) => {
      if (modeRef.current === "passenger") return; // the autopilot steers
      e.setTarget((side > 0 ? 1 : side < 0 ? -1 : 0) as Band);
    };
    flattenRef.current = () => {
      void e.end(feedRef.current.mid, "rider");
    };
    setArmed(true);
  }, [mera.wallet, mera.address, perpl.account, rails]);

  const disarm = useCallback(async () => {
    const e = engine.current;
    if (e && e.state.status === "riding") await e.end(feedRef.current.mid, "rider");
    engine.current = null;
    setTargetRef.current = null;
    flattenRef.current = null;
    setArmed(false);
    void perpl.refresh();
    void mera.refresh();
  }, [perpl, mera]);

  // the heartbeat: every feed sample ticks the engine (rails, stop, reconcile)
  useEffect(() => {
    const e = engine.current;
    if (!e || e.state.status !== "riding" || !feed.mid) return;
    if (mode === "passenger") {
      const sig = readSignal(feed.series, feed.tape);
      const want = passenger.current.decide(sig.signal, e.state.band);
      if (want !== e.state.target) e.setTarget(want);
    }
    void e.tick(feed.mid, mode === "passenger" ? "passenger" : "player");
  }, [feed.series, feed.mid, feed.tape, mode]);

  // a ride the rails ended (timer, max loss) disarms itself
  useEffect(() => {
    if (armed && state?.status === "ended") {
      setTargetRef.current = null;
      flattenRef.current = null;
    }
  }, [armed, state?.status]);

  // never leave a position open behind a closed tab or screen
  useEffect(
    () => () => {
      const e = engine.current;
      if (e && e.state.status === "riding") void e.end(feedRef.current.mid, "left");
    },
    [],
  );

  return {
    feed,
    mera,
    perpl,
    receipt,
    dismissReceipt: () => setReceipt(null),
    armed,
    arm,
    disarm,
    canArm,
    ready,
    armError,
    mode,
    setMode,
    rails,
    setRails,
    state,
    signal: readSignal(feed.series, feed.tape),
    refs: { setTargetRef, flattenRef, realRef },
  };
}

export type LiveBridge = ReturnType<typeof useLiveBridge>;
