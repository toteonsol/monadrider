"use client";
/**
 * Inside a world: what's really happening on Perpl, at a glance. Market,
 * fills, net, the last fill with its Monad tx, and the radio bell.
 */
import type { LiveBridge } from "@/lib/ride/useLiveBridge";
import { netPnl } from "@/lib/ride/engine";
import { RadioBell } from "./PitRadio";
import { TxLink } from "./TxLink";
import { signedUsd } from "@/lib/fmt";

export function LiveChip({ bridge: b, asset, onRide }: { bridge: LiveBridge; asset: string; onRide: (a: string) => void }) {
  const s = b.state;
  const last = s?.fills.at(-1);
  const net = s ? netPnl(s, b.feed.mid) : 0;
  return (
    <div className="pointer-events-none fixed left-3 top-[calc(124px+var(--safe-top))] z-[93] flex max-w-[70vw] flex-col items-start gap-2">
      <div className="pointer-events-auto">
        <RadioBell onRide={onRide} />
      </div>
      {b.armed && s && (
        <div className="pointer-events-auto border-2 border-chart/70 bg-ink/85 px-3 py-2 text-[11.5px] backdrop-blur-md">
          <div className="display flex items-center gap-2 text-[10.5px] font-black uppercase tracking-[0.12em] text-chart">
            <span className="h-2 w-2 animate-pulse rounded-full bg-chart" /> live · {asset} · Perpl
            <span className="font-telemetry font-normal text-flat">{s.fills.length} fills</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className={`font-telemetry font-bold ${net > 0 ? "text-chart" : net < 0 ? "text-blood" : "text-bone"}`}>{signedUsd(net)}</span>
            <span className="text-flat">
              {s.busy ? "sending to Monad…" : s.band ? (s.band > 0 ? "holding long" : "holding short") : "flat"}
            </span>
          </div>
          {last && (
            <div className="mt-0.5 flex items-center gap-2 text-[11px]">
              <span className="text-bone">
                {last.action === "close" ? "closed" : last.action === "open-long" ? "long" : "short"} @ {last.px.toPrecision(6)}
              </span>
              {last.txid && <TxLink hash={last.txid} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
