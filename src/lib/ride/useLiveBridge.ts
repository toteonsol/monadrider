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
import { PerplExecutor } from "./perplExecutor";
import { useApiKeyAccount } from "@/lib/perpl/useApiKeyAccount";
import { getPerplWs } from "@/lib/perpl/wsClient";
import { Passenger, readSignal } from "./passenger";
import { pushRideTx, takeRideTxids } from "./session";
import { useMarketFeed } from "@/lib/perpl/market";
import { readPosition } from "@/lib/perpl/onchain";
import { publicClient, useMera } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";
import { setRideAsset } from "@/lib/game/liveFeed";
import { setRideAddress } from "./session";
import { saveReceipt, type Receipt } from "./receipts";
import { submitLiveRide } from "@/lib/game/backend";
import { radio } from "@/lib/radio";

export type DriveMode = "turbo" | "passenger";
/** where live orders come from: the passkey wallet (orders sent onchain from
 *  it) or an existing Perpl account (trade-only API key, Perpl forwards) */
export type Route = "passkey" | "perpl";

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
  const apiAcct = useApiKeyAccount();
  const [route, setRoute] = useState<Route>("passkey");
  // a connected Perpl account becomes the default route
  useEffect(() => {
    if (apiAcct.status === "ready") setRoute("perpl");
  }, [apiAcct.status]);
  const feed = useMarketFeed(asset);
  const [armed, setArmed] = useState(false);
  const [mode, setMode] = useState<DriveMode>("turbo");
  const [rails, setRails] = useState<Rails>(DEFAULT_RAILS);
  const [state, setState] = useState<RideState | null>(null);
  const [armError, setArmError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  /** the venue's own view of the position, read from Perpl (not the engine's) */
  const [venuePos, setVenuePos] = useState<{ side: 1 | -1 | 0; size: number; entry: number; pnl: number | null; at: number } | null>(null);
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

  // Perpl doesn't serve some regions; live trading honours its list on every route
  const [region, setRegion] = useState<{ country: string | null; blocked: boolean }>({ country: null, blocked: false });
  useEffect(() => {
    fetch("/api/geo", { cache: "no-store" })
      .then((r) => r.json())
      .then((g: { country: string | null; blocked: boolean }) => setRegion({ country: g.country, blocked: !!g.blocked }))
      .catch(() => {});
  }, []);

  const marginNeeded = rails.clipUsd / LEVERAGE;
  const viaKey = route === "perpl";
  const ready = viaKey
    ? {
        wallet: apiAcct.status === "ready",
        gas: apiAcct.forwarding !== false, // Perpl pays gas when one-click trading is on
        account: apiAcct.accountId > 0,
        margin: apiAcct.free >= marginNeeded * 1.2,
      }
    : {
        wallet: !!mera.address,
        gas: (mera.balances?.mon ?? 0) >= 0.05,
        account: !!perpl.account,
        margin: (perpl.account?.free ?? 0) >= marginNeeded * 1.2,
      };
  const canArm = ready.wallet && ready.gas && ready.account && ready.margin && !!feed.market && !region.blocked;

  /** Arm: build the engine and publish the refs the worlds call. */
  const arm = useCallback(async () => {
    setArmError("");
    if (region.blocked) return setArmError(`Perpl isn't available in your region (${region.country}), so live trading is off here. Practice is open to everyone.`);
    const m = feedRef.current.market;
    if (!m) return setArmError("Waiting for the Perpl market feed.");
    let exec;
    let owner: string | null;
    if (route === "perpl") {
      if (!apiAcct.key || apiAcct.status !== "ready") return setArmError("Connect your Perpl account first.");
      const held = getPerplWs(apiAcct.key).getPosition(m.name);
      if (held) return setArmError(`You already hold a ${held.szi > 0 ? "long" : "short"} ${m.name} on Perpl. Close it first so the ride starts flat.`);
      exec = new PerplExecutor(apiAcct.key, m.name);
      owner = apiAcct.owner;
    } else {
      if (!mera.wallet || !perpl.account) return setArmError("Not ready yet: passkey wallet and Perpl account are needed.");
      const pos = await readPosition(publicClient, m, perpl.account.id).catch(() => null);
      if (pos && pos.side !== 0) {
        return setArmError(`You already hold a ${pos.side > 0 ? "long" : "short"} ${m.name} on Perpl. Close it first so the ride starts flat.`);
      }
      exec = new OnchainExecutor(publicClient, mera.wallet, m, perpl.account.id, LEVERAGE);
      owner = mera.address;
    }
    const e = new RideEngine(exec, rails);
    let seen = 0;
    const autopilot = modeRef.current === "passenger";
    e.subscribe((s) => {
      setState(s);
      // collect every fill's tx before a final submit can take the trail
      for (; seen < s.fills.length; seen++) {
        const f = s.fills[seen];
        pushRideTx(f.txid);
        if (f.reason === "stop")
          radio({ kind: "ride", tone: "warn", title: `Stop hit on ${m.name}`, body: `Price moved ${e.rails.stopPct}% against the position, so it closed${f.pnl != null ? ` at ${f.pnl >= 0 ? "+" : "−"}$${Math.abs(f.pnl).toFixed(2)}` : ""}. That's the rail doing its job: small loss, ride goes on.`, asset: m.name, tx: f.txid });
        else if (f.reason === "take")
          radio({ kind: "ride", tone: "good", title: `Take-profit on ${m.name}`, body: `Price moved ${e.rails.takePct}% your way, so the gain was banked${f.pnl != null ? `: +$${Math.abs(f.pnl).toFixed(2)}` : ""}.`, asset: m.name, tx: f.txid });
      }
      if (s.status === "ended" && engine.current === e) {
        const rec = saveReceipt(s, { asset: m.name, mode: "live", autopilot, rails: e.rails, owner, lastMid: feedRef.current.mid });
        setReceipt(rec);
        radio({
          kind: "ride",
          tone: rec.net >= 0 ? "good" : "warn",
          title: `${autopilot ? "Passenger" : "Your"} ride on ${m.name}: ${rec.net >= 0 ? "+" : "−"}$${Math.abs(rec.net).toFixed(2)}`,
          body: `${rec.trades} round trips, $${Math.round(rec.volume)} volume, $${rec.fees.toFixed(2)} fees, ${rec.wipeouts} stop${rec.wipeouts === 1 ? "" : "s"}. Every fill is on the receipt with its Monad tx.`,
          asset: m.name,
          tx: rec.fills.find((x) => x.txid)?.txid,
        });
        if (rec.wipeouts >= 2)
          radio({ kind: "tip", tone: "info", title: "Tip · stops kept hitting", body: "When the stop keeps firing, the market is choppier than your stop is wide. Widen it a little, or sit on the line (flat) until the swell picks a side." });
        else if (rec.trades >= 6 && rec.fees > Math.abs(rec.realized))
          radio({ kind: "tip", tone: "info", title: "Tip · fees outran the moves", body: "Lots of quick flips paid more in fees than the price moved. Hold a lane longer, or let Passenger pace it." });
        if (s.fills.length) {
          submitLiveRide({
            owner,
            mode: autopilot ? "passenger" : "drive",
            asset: m.name,
            volume: s.volume,
            fees: s.fees,
            pnl: rec.net,
            fills: s.fills.length,
            txids: takeRideTxids(),
          });
        }
      }
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
    setRideAddress(owner && /^0x[0-9a-fA-F]{40}$/.test(owner) ? owner : null);
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
  }, [mera.wallet, mera.address, perpl.account, rails, route, apiAcct.key, apiAcct.status, apiAcct.owner, region]);

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

  /** Live controls from the cockpit (work in both drive modes). */
  const closeNow = useCallback(() => engine.current?.setTarget(0), []);
  const flip = useCallback(() => {
    const e = engine.current;
    if (e && e.state.band !== 0) e.setTarget((-e.state.band) as Band);
  }, []);
  const tuneRails = useCallback((r: Partial<Rails>) => {
    setRails((cur) => ({ ...cur, ...r }));
    engine.current?.setRails(r);
  }, []);

  // the venue's own numbers, polled while live (proof next to the game)
  useEffect(() => {
    if (!armed) {
      setVenuePos(null);
      return;
    }
    let dead = false;
    const read = async () => {
      const m = feedRef.current.market;
      if (!m) return;
      try {
        if (route === "perpl" && apiAcct.key) {
          const p = getPerplWs(apiAcct.key).getPosition(m.name);
          if (!dead)
            setVenuePos(
              p
                ? { side: p.szi > 0 ? 1 : -1, size: Math.abs(p.szi), entry: p.entryPx, pnl: p.szi * ((feedRef.current.mid || p.entryPx) - p.entryPx), at: Date.now() }
                : { side: 0, size: 0, entry: 0, pnl: null, at: Date.now() },
            );
        } else if (perpl.account) {
          const p = await readPosition(publicClient, m, perpl.account.id);
          if (!dead) setVenuePos({ side: p.side, size: p.size, entry: p.entry, pnl: p.side ? p.side * p.size * ((p.mark || feedRef.current.mid) - p.entry) : null, at: Date.now() });
        }
      } catch {}
    };
    void read();
    const t = setInterval(read, 2500);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [armed, route, apiAcct.key, perpl.account]);

  return {
    feed,
    venuePos,
    closeNow,
    flip,
    tuneRails,
    mera,
    perpl,
    apiAcct,
    route,
    setRoute,
    receipt,
    dismissReceipt: () => setReceipt(null),
    armed,
    arm,
    disarm,
    canArm,
    ready,
    armError,
    region,
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
