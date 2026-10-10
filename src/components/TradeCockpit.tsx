"use client";
/**
 * The cockpit · Perpl on Monad. Pick a market, pick who drives (you, or
 * Passenger), set the rails, check the four lights, go live into a world.
 * While armed it is the pit wall: live net, fills, the last Monad tx, and the
 * autopilot's signal.
 */
import { useEffect, useState } from "react";
import type { LiveBridge } from "@/lib/ride/useLiveBridge";
import { RAIL_LIMITS, netPnl } from "@/lib/ride/engine";
import { fetchPerplContext } from "@/lib/perpl/config";
import { LiveTape } from "./LiveTape";
import { TxLink } from "./TxLink";
import { price, signedUsd, usd } from "@/lib/fmt";

export const MARKETS = ["MON", "BTC", "ETH", "SOL", "HYPE"] as const;

export function TradeCockpit({
  bridge,
  asset,
  setAsset,
  onRide,
  onMoney,
}: {
  bridge: LiveBridge;
  asset: string;
  setAsset: (a: string) => void;
  /** open the world picker (armed or not) */
  onRide: () => void;
  onMoney: () => void;
}) {
  const b = bridge;
  const [mids, setMids] = useState<Record<string, number>>({});
  useEffect(() => {
    let dead = false;
    const read = () =>
      fetchPerplContext()
        .then((c) => !dead && setMids(Object.fromEntries(MARKETS.map((m) => [m, c.markets[m]?.mid ?? 0]))))
        .catch(() => {});
    read();
    const t = setInterval(read, 10_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  const r = b.rails;
  const set = (k: keyof typeof r, v: number) => b.setRails({ ...r, [k]: v });
  const s = b.state;
  const net = s ? netPnl(s, b.feed.mid) : 0;
  const lastTx = s?.fills.filter((f) => f.txid).at(-1)?.txid;
  const lights = [
    { ok: b.ready.wallet, t: "passkey wallet", fix: "log in" },
    { ok: b.ready.gas, t: "MON for gas", fix: "add MON" },
    { ok: b.ready.account, t: "Perpl account", fix: "deposit AUSD" },
    { ok: b.ready.margin, t: `margin ≥ ${usd((r.clipUsd / 3) * 1.2)}`, fix: "top up" },
  ];

  async function goLive() {
    await b.arm();
    onRide();
  }

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-4 px-4 pb-28 pt-2 lg:grid-cols-[1fr_340px] lg:pb-8">
      <div className="space-y-4">
        <div>
          <div className="display text-[11px] font-bold uppercase tracking-[0.16em] text-papaya">The cockpit · Perpl on Monad</div>
          <h1 className="display mt-1 text-[26px] font-black uppercase leading-none text-bone min-[900px]:text-[34px]">Pick a market. Go live.</h1>
          <p className="mt-2 text-[13px] text-flat">
            Every lane you hold is one IOC order from your passkey wallet straight to Perpl&apos;s Exchange contract: one Monad
            transaction, settled in a block.
          </p>
        </div>

        {/* market board */}
        <div className="grid grid-cols-2 border-2 border-steel min-[560px]:grid-cols-5">
          {MARKETS.map((m, i) => (
            <button
              key={m}
              disabled={b.armed}
              onClick={() => setAsset(m)}
              className={`px-3 py-3 text-left transition ${i < MARKETS.length - 1 ? "border-b-2 border-hairline min-[560px]:border-b-0 min-[560px]:border-r-2" : ""} ${
                asset === m ? "bg-papaya/15" : "hover:bg-ink-soft"
              } disabled:opacity-60`}
            >
              <div className={`display text-[14px] font-black ${asset === m ? "text-papaya" : "text-bone"}`}>{m}</div>
              <div className="font-telemetry text-[12px] text-flat">{price(mids[m] ?? 0)}</div>
            </button>
          ))}
        </div>

        {/* who drives */}
        <div className="grid grid-cols-2 border-2 border-steel">
          {(
            [
              ["turbo", "You drive", "steer the world · every lane change is a trade"],
              ["passenger", "Passenger", "the autopilot reads Perpl's order flow and steers"],
            ] as const
          ).map(([k, t, d], i) => (
            <button
              key={k}
              disabled={b.armed}
              onClick={() => b.setMode(k)}
              className={`px-4 py-3 text-left ${i === 0 ? "border-r-2 border-steel" : ""} ${b.mode === k ? "bg-papaya/15" : "hover:bg-ink-soft"} disabled:opacity-60`}
            >
              <div className={`display text-[13px] font-black uppercase ${b.mode === k ? "text-papaya" : "text-bone"}`}>{t}</div>
              <div className="text-[11.5px] leading-snug text-flat">{d}</div>
            </button>
          ))}
        </div>

        {/* rails */}
        <div className="border-2 border-steel bg-ink-soft">
          <div className="flex items-center justify-between border-b-2 border-steel px-4 py-2.5">
            <span className="display text-[11px] font-bold uppercase tracking-[0.14em] text-flat">Safety rails</span>
            <span className="text-[11px] text-flat">you can&apos;t blow up</span>
          </div>
          <div className="grid gap-4 px-4 py-4 min-[640px]:grid-cols-2">
            <Slider label="Clip (each position)" v={r.clipUsd} min={2} max={RAIL_LIMITS.clipUsdMax} step={1} fmt={(x) => usd(x, 0)} on={(x) => set("clipUsd", x)} off={b.armed} />
            <Slider label="Stop (move against you)" v={r.stopPct} min={0.2} max={2} step={0.1} fmt={(x) => `${x.toFixed(1)}%`} on={(x) => set("stopPct", x)} off={b.armed} />
            <Slider label="Max loss, then it ends" v={r.lossLimitUsd} min={1} max={RAIL_LIMITS.lossLimitMax} step={1} fmt={(x) => usd(x, 0)} on={(x) => set("lossLimitUsd", x)} off={b.armed} />
            <Slider label="Ride length" v={r.durationSec} min={60} max={600} step={60} fmt={(x) => `${x / 60} min`} on={(x) => set("durationSec", x)} off={b.armed} />
          </div>
          <p className="border-t border-hairline px-4 py-2.5 text-[11.5px] text-flat">
            {usd(r.clipUsd, 0)} at 3× = {usd(r.clipUsd / 3)} margin per position. Every exit closes it: end, stop, max loss, or leaving.
          </p>
        </div>

        {/* four lights → go live */}
        {!b.armed ? (
          <div className="border-2 border-steel bg-ink-soft p-4">
            <div className="grid grid-cols-2 gap-2 min-[640px]:grid-cols-4">
              {lights.map((l) => (
                <button key={l.t} onClick={l.ok ? undefined : onMoney} className={`border-2 px-3 py-2 text-left ${l.ok ? "border-chart/50" : "border-steel hover:border-papaya"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${l.ok ? "bg-chart" : "bg-steel"}`} />
                    <span className="text-[12px] font-bold text-bone">{l.t}</span>
                  </div>
                  {!l.ok && <div className="mt-0.5 text-[10.5px] uppercase tracking-wide text-papaya">{l.fix} →</div>}
                </button>
              ))}
            </div>
            {b.armError && <p className="mt-3 text-[12.5px] text-blood">{b.armError}</p>}
            <div className="mt-4 grid gap-2 min-[560px]:grid-cols-2">
              <button
                onClick={() => void goLive()}
                disabled={!b.canArm}
                className="gp-btn gp-btn-primary display border-2 border-papaya bg-papaya px-4 py-3.5 text-[13px] font-black uppercase tracking-wide text-ink disabled:opacity-40"
              >
                ● go live · pick a world
              </button>
              <button onClick={onRide} className="gp-btn display border-2 border-steel px-4 py-3.5 text-[12px] font-bold uppercase tracking-wide text-flat hover:border-papaya hover:text-papaya">
                ▶ free lap first
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-chart bg-ink-soft">
            <div className="flex items-center justify-between border-b-2 border-chart/40 px-4 py-2.5">
              <span className="display flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-chart">
                <span className="h-2 w-2 animate-pulse rounded-full bg-chart" /> live · {asset}-PERP · {b.mode === "passenger" ? "Passenger" : "you drive"}
              </span>
              <span className="font-telemetry text-[12px] text-flat">{s?.fills.length ?? 0} fills</span>
            </div>
            <div className="grid grid-cols-3">
              <Big k="net" v={signedUsd(net)} tone={net > 0 ? "text-chart" : net < 0 ? "text-blood" : "text-bone"} />
              <Big k="volume" v={usd(s?.volume ?? 0, 0)} />
              <Big k="fees" v={usd(s?.fees ?? 0)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 text-[12px]">
              <span className="text-flat">{s?.busy ? "sending to Perpl…" : s?.lastError || (s?.band ? (s.band > 0 ? "holding long" : "holding short") : "flat")}</span>
              {lastTx && (
                <span>
                  last tx <TxLink hash={lastTx} />
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 pt-0">
              <button onClick={onRide} className="gp-btn gp-btn-primary display border-2 border-papaya bg-papaya px-4 py-3 text-[12px] font-black uppercase text-ink">
                ▶ back into a world
              </button>
              <button onClick={() => void b.disarm()} className="gp-btn display border-2 border-blood px-4 py-3 text-[12px] font-black uppercase text-blood">
                flatten + stop
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        {b.mode === "passenger" && <Signal v={b.signal.signal} trend={b.signal.trend} flow={b.signal.flow} />}
        <LiveTape tape={b.feed.tape} asset={asset} />
      </aside>
    </div>
  );
}

function Big({ k, v, tone = "text-bone" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="border-r border-hairline px-3 py-3 text-center last:border-r-0">
      <div className="display text-[10px] font-bold uppercase tracking-[0.14em] text-flat">{k}</div>
      <div className={`display mt-1 text-[20px] font-bold tabular-nums ${tone}`}>{v}</div>
    </div>
  );
}

function Signal({ v, trend, flow }: { v: number; trend: number; flow: number }) {
  return (
    <div className="border-2 border-steel bg-ink-soft px-4 py-3">
      <div className="display text-[10.5px] font-bold uppercase tracking-[0.14em] text-flat">Passenger · live signal</div>
      <div className="relative mt-3 h-2 bg-gradient-to-r from-blood via-steel to-chart">
        <div className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 bg-bone" style={{ left: `${((v + 1) / 2) * 100}%` }} />
      </div>
      <div className="font-telemetry mt-2 flex justify-between text-[11px] text-flat">
        <span>short</span>
        <span>trend {trend.toFixed(2)} · flow {flow.toFixed(2)}</span>
        <span>long</span>
      </div>
    </div>
  );
}

function Slider({ label, v, min, max, step, fmt, on, off }: { label: string; v: number; min: number; max: number; step: number; fmt: (x: number) => string; on: (x: number) => void; off: boolean }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[12px]">
        <span className="text-flat">{label}</span>
        <span className="font-telemetry font-bold text-bone">{fmt(v)}</span>
      </div>
      <input type="range" disabled={off} min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="mt-1.5 w-full accent-[var(--papaya)]" />
    </label>
  );
}
