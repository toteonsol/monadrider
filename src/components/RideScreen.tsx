"use client";
/**
 * Ride screen · Surfer (you steer) and Passenger (the autopilot steers) share it.
 *
 * Before the ride: pick the market, Practice or Live, and the safety rails.
 * During: the wave fills the screen, the controls sit in the thumb zone.
 * After: a receipt with every fill's Monad tx.
 */
import { useEffect, useMemo, useState } from "react";
import { useMarketFeed } from "@/lib/perpl/market";
import { useRide } from "@/lib/ride/useRide";
import { DEFAULT_RAILS, RAIL_LIMITS, type Band, type Rails } from "@/lib/ride/engine";
import { OnchainExecutor } from "@/lib/ride/onchainExecutor";
import { useMera, publicClient } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";
import { readPosition } from "@/lib/perpl/onchain";
import { WaveCanvas } from "./WaveCanvas";
import { ReceiptSheet } from "./ReceiptSheet";
import { LiveTape } from "./LiveTape";
import { price, signedUsd, clock, usd } from "@/lib/fmt";
import { sfx, isMuted, setMuted } from "@/lib/game/sfx";
import { CoachOverlay } from "./CoachOverlay";

export const MARKETS = ["MON", "BTC", "ETH", "SOL", "HYPE"] as const;
const LEVERAGE = 3;

const BAND_WORD: Record<Band, string> = { 1: "Crest · long", 0: "Line · flat", [-1]: "Trough · short" } as Record<Band, string>;

export function RideScreen({
  autopilot,
  asset,
  setAsset,
  goMoney,
  goSpot,
}: {
  autopilot: boolean;
  asset: string;
  setAsset: (a: string) => void;
  goMoney: () => void;
  goSpot: () => void;
}) {
  const feed = useMarketFeed(asset);
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const [mode, setMode] = useState<"practice" | "live">("practice");
  const [rails, setRails] = useState<Rails>(DEFAULT_RAILS);
  const [startErr, setStartErr] = useState("");
  const [starting, setStarting] = useState(false);
  const ride = useRide(feed, { asset, rails, autopilot, owner: mera.address });
  const [now, setNow] = useState(Date.now());
  const s = ride.state;
  const riding = s.status === "riding";

  useEffect(() => {
    if (!riding) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [riding]);

  const marginNeeded = rails.clipUsd / LEVERAGE;
  const live = useMemo(() => {
    const steps = [
      { ok: !!mera.address, text: "Log in with your passkey" },
      { ok: (mera.balances?.mon ?? 0) >= 0.05, text: "Hold a little MON for gas" },
      { ok: !!perpl.account, text: "Open a Perpl account (deposit AUSD)" },
      { ok: (perpl.account?.free ?? 0) >= marginNeeded * 1.2, text: `Free margin ≥ ${usd(marginNeeded * 1.2)}` },
    ];
    return { steps, ready: steps.every((x) => x.ok) };
  }, [mera.address, mera.balances, perpl.account, marginNeeded]);

  const dayChange = feed.prev ? ((feed.mid - feed.prev) / feed.prev) * 100 : 0;
  const left = riding ? rails.durationSec * 1000 - (now - s.startedAt) : rails.durationSec * 1000;

  async function start() {
    setStartErr("");
    if (!feed.market || !feed.mid) return setStartErr("Waiting for the market feed…");
    if (mode === "practice") return ride.start(null);
    if (!live.ready || !mera.wallet || !perpl.account) return setStartErr("Live riding isn't ready yet. See the checklist.");
    setStarting(true);
    try {
      const pos = await readPosition(publicClient, feed.market, perpl.account.id);
      if (pos.side !== 0) {
        setStartErr(`You already hold a ${pos.side > 0 ? "long" : "short"} ${asset} on Perpl. Close it on Perpl first so the ride starts flat.`);
        return;
      }
      ride.start(new OnchainExecutor(publicClient, mera.wallet, feed.market, perpl.account.id, LEVERAGE));
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  const sig = ride.signal.signal;

  // sound: fills ping, a winning close chimes, a stop crashes, the end sings or sighs
  const [muted, setMute] = useState(false);
  useEffect(() => setMute(isMuted()), []);
  const [heard, setHeard] = useState({ fills: 0, wipeouts: 0, status: s.status });
  useEffect(() => {
    if (s.fills.length > heard.fills) {
      const f = s.fills[s.fills.length - 1];
      if (f.action !== "close") sfx.fill();
      else if ((f.pnl ?? 0) > 0) sfx.coin();
      else if (f.reason !== "stop") sfx.dodge();
    }
    if (s.wipeouts > heard.wipeouts) sfx.crash();
    if (s.status === "ended" && heard.status === "riding") (ride.net >= 0 ? sfx.cascade : sfx.runOver)();
    if (s.fills.length !== heard.fills || s.wipeouts !== heard.wipeouts || s.status !== heard.status)
      setHeard({ fills: s.fills.length, wipeouts: s.wipeouts, status: s.status });
  }, [s.fills, s.wipeouts, s.status, heard, ride.net]);
  const steer = (b: Band) => {
    sfx.click();
    ride.setBand(b);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row lg:gap-4">
      <section className="relative flex min-h-0 flex-1 flex-col">
        {/* HUD */}
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <select
                value={asset}
                disabled={riding}
                onChange={(e) => setAsset(e.target.value)}
                className="num rounded-lg border border-line bg-ink-3 px-2 py-1 text-sm font-semibold text-lavender"
                aria-label="Market"
              >
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}-PERP
                  </option>
                ))}
              </select>
              <span className={`h-2 w-2 rounded-full ${feed.connected ? "bg-cyan" : "bg-amber"}`} title={feed.connected ? "live" : "connecting"} />
              <button
                className="label rounded-md px-1.5 py-1 hover:text-lavender"
                onClick={() => {
                  setMuted(!muted);
                  setMute(!muted);
                  if (muted) sfx.click();
                }}
                aria-label={muted ? "Sound on" : "Sound off"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            </div>
            <div className="num mt-1 text-2xl font-semibold">{price(feed.mid)}</div>
            <div className={`num text-xs ${dayChange >= 0 ? "text-cyan" : "text-pink"}`}>
              {dayChange >= 0 ? "▲" : "▼"} {Math.abs(dayChange).toFixed(2)}% 24h · Perpl on Monad
            </div>
          </div>
          <div className="text-right">
            <div className="label">{riding ? (s.status === "riding" ? (mode === "live" ? "Live P&L" : "Practice P&L") : "") : autopilot ? "Passenger" : "Surfer"}</div>
            <div className={`num text-2xl font-semibold ${ride.net > 0 ? "text-cyan" : ride.net < 0 ? "text-pink" : "text-lavender"}`}>
              {riding ? signedUsd(ride.net) : "—"}
            </div>
            <div className="num text-xs text-mute">{riding ? `${clock(left)} left · ${s.fills.length} fills` : `${clock(left)} ride`}</div>
          </div>
        </div>

        {/* the wave */}
        <div className="relative min-h-[260px] flex-1">
          <WaveCanvas
            series={feed.series}
            tape={feed.tape}
            band={s.band}
            target={s.target}
            entryPx={s.entryPx}
            wipeouts={s.wipeouts}
            riding={riding}
            onBand={riding && !autopilot ? steer : undefined}
          />
          {riding && !autopilot && <CoachOverlay />}
          {riding && (
            <div className="pointer-events-none absolute left-4 top-2 rounded-full border border-line bg-ink/70 px-3 py-1 text-xs backdrop-blur">
              <span className={s.band > 0 ? "text-cyan" : s.band < 0 ? "text-pink" : "text-lavender"}>{BAND_WORD[s.band]}</span>
              {s.busy && <span className="ml-2 text-mute">· sending…</span>}
            </div>
          )}
          {riding && s.lastError && (
            <div className="absolute inset-x-4 bottom-2 rounded-xl border border-pink/40 bg-ink/90 px-3 py-2 text-xs text-pink">{s.lastError}</div>
          )}
          {!feed.series.length && (
            <div className="absolute inset-0 grid place-items-center text-sm text-mute">Reading the swell…</div>
          )}
        </div>

        {/* controls */}
        <div className="px-4 pb-[calc(12px+var(--safe-bottom))] pt-2">
          {riding ? (
            autopilot ? (
              <div className="space-y-3">
                <SignalGauge value={sig} trend={ride.signal.trend} flow={ride.signal.flow} />
                <button className="btn btn-ghost w-full" onClick={() => void ride.stop()}>
                  Bail out · flatten and end
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <BandButton label="Short" sub="trough" active={s.target === -1} color="pink" onClick={() => steer(-1)} />
                  <BandButton label="Flat" sub="line" active={s.target === 0} color="lavender" onClick={() => steer(0)} />
                  <BandButton label="Long" sub="crest" active={s.target === 1} color="cyan" onClick={() => steer(1)} />
                </div>
                <button className="btn btn-ghost w-full !py-2.5" onClick={() => void ride.stop()}>
                  End ride
                </button>
              </div>
            )
          ) : (
            <PreRide
              autopilot={autopilot}
              mode={mode}
              setMode={setMode}
              rails={rails}
              setRails={setRails}
              live={live}
              loggedIn={!!mera.address}
              onStart={start}
              starting={starting}
              error={startErr}
              goMoney={goMoney}
            />
          )}
        </div>
      </section>

      <aside className="hidden w-[340px] shrink-0 flex-col gap-3 overflow-y-auto pb-4 lg:flex">
        <LiveTape tape={feed.tape} asset={asset} />
      </aside>

      {ride.receipt && <ReceiptSheet receipt={ride.receipt} onClose={ride.dismiss} onSpot={goSpot} />}
    </div>
  );
}

function BandButton({ label, sub, active, color, onClick }: { label: string; sub: string; active: boolean; color: "cyan" | "pink" | "lavender"; onClick: () => void }) {
  const on = { cyan: "bg-cyan text-ink", pink: "bg-pink text-ink", lavender: "bg-lavender text-ink" }[color];
  return (
    <button onClick={onClick} className={`btn !py-4 ${active ? on : "btn-ghost"}`} aria-pressed={active}>
      <div className="text-sm">{label}</div>
      <div className="text-[10px] opacity-70">{sub}</div>
    </button>
  );
}

function SignalGauge({ value, trend, flow }: { value: number; trend: number; flow: number }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="card px-4 py-3">
      <div className="flex justify-between">
        <span className="label">Short</span>
        <span className="label">Passenger signal</span>
        <span className="label">Long</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-pink via-ink-3 to-cyan">
        <div className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded bg-white" style={{ left: `${pct}%` }} />
      </div>
      <div className="num mt-2 flex justify-between text-[11px] text-mute">
        <span>trend {trend.toFixed(2)}</span>
        <span>{value.toFixed(2)}</span>
        <span>flow {flow.toFixed(2)}</span>
      </div>
    </div>
  );
}

function PreRide(p: {
  autopilot: boolean;
  mode: "practice" | "live";
  setMode: (m: "practice" | "live") => void;
  rails: Rails;
  setRails: (r: Rails) => void;
  live: { steps: { ok: boolean; text: string }[]; ready: boolean };
  loggedIn: boolean;
  onStart: () => void;
  starting: boolean;
  error: string;
  goMoney: () => void;
}) {
  const [open, setOpen] = useState(false);
  const r = p.rails;
  const set = (k: keyof Rails, v: number) => p.setRails({ ...r, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-ink-2 p-1">
        {(["practice", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => p.setMode(m)}
            className={`btn !py-2.5 ${p.mode === m ? (m === "live" ? "bg-monad text-white" : "bg-ink-3 text-lavender") : "text-mute"}`}
          >
            {m === "practice" ? "Practice" : "Live · Perpl"}
          </button>
        ))}
      </div>

      {p.mode === "live" && !p.live.ready && (
        <div className="card space-y-1.5 px-4 py-3 text-sm">
          {p.live.steps.map((s) => (
            <div key={s.text} className="flex items-center gap-2">
              <span className={s.ok ? "text-cyan" : "text-mute"}>{s.ok ? "✓" : "○"}</span>
              <span className={s.ok ? "text-lavender" : ""}>{s.text}</span>
            </div>
          ))}
          <button className="btn btn-ghost mt-2 w-full !py-2.5" onClick={p.goMoney}>
            {p.loggedIn ? "Set up in Money" : "Log in"}
          </button>
        </div>
      )}

      <button className="label flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <span>
          Safety rails · {usd(r.clipUsd, 0)} clip · stop {r.stopPct}% · max loss {usd(r.lossLimitUsd, 0)} · {Math.round(r.durationSec / 60)} min
        </span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="card grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          <Slider label="Clip (position size)" value={r.clipUsd} min={2} max={RAIL_LIMITS.clipUsdMax} step={1} fmt={(v) => usd(v, 0)} onChange={(v) => set("clipUsd", v)} />
          <Slider label="Stop (move against you)" value={r.stopPct} min={0.2} max={2} step={0.1} fmt={(v) => `${v.toFixed(1)}%`} onChange={(v) => set("stopPct", v)} />
          <Slider label="Max loss, then the ride ends" value={r.lossLimitUsd} min={1} max={RAIL_LIMITS.lossLimitMax} step={1} fmt={(v) => usd(v, 0)} onChange={(v) => set("lossLimitUsd", v)} />
          <Slider label="Ride length" value={r.durationSec} min={60} max={600} step={60} fmt={(v) => `${v / 60} min`} onChange={(v) => set("durationSec", v)} />
          <p className="text-xs text-mute sm:col-span-2">
            Positions are {usd(r.clipUsd, 0)} at {LEVERAGE}× ({usd(r.clipUsd / LEVERAGE)} margin). Every exit (end, stop, max loss, leaving the screen) closes the position.
          </p>
        </div>
      )}

      {p.error && <div className="text-sm text-pink">{p.error}</div>}
      <button className="btn btn-primary glow w-full !py-4 text-base" onClick={p.onStart} disabled={p.starting || (p.mode === "live" && !p.live.ready)}>
        {p.starting ? "Checking…" : p.autopilot ? `Start Passenger · ${p.mode === "live" ? "live" : "practice"}` : `Paddle in · ${p.mode === "live" ? "live" : "practice"}`}
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="num text-lavender">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#6e54ff]" />
    </label>
  );
}
