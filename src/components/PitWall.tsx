"use client";
/**
 * The pit wall · the drive's smart layer. Reads the road you're on (spread,
 * round-trip cost, 30-second swing, who's winning the flow) and says what to
 * do in plain words; points at better Perpl roads with the numbers; and gives
 * the one-tap "sit out" when it's a storm.
 */
import { useEffect, useRef, useState } from "react";
import type { LiveBridge } from "@/lib/ride/useLiveBridge";
import { readConditions, useRoads, betterRoads, type Weather } from "@/lib/conditions";
import { radio } from "@/lib/radio";

const W: Record<Weather, { label: string; cls: string; dot: string }> = {
  calm: { label: "calm", cls: "border-chart text-chart", dot: "bg-chart" },
  choppy: { label: "choppy", cls: "border-amber text-amber", dot: "bg-amber" },
  storm: { label: "storm", cls: "border-blood text-blood", dot: "bg-blood" },
};

export function PitWall({
  bridge: b,
  asset,
  onSwitch,
  compact = false,
}: {
  bridge: LiveBridge;
  asset: string;
  onSwitch: (a: string) => void;
  compact?: boolean;
}) {
  const roads = useRoads();
  const [open, setOpen] = useState(!compact);
  const c = readConditions({
    series: b.feed.series,
    bid: b.feed.bid,
    ask: b.feed.ask,
    takerBps: b.feed.market?.takerFeeBps ?? 3.45,
    stopPct: b.rails.stopPct,
    signal: b.signal.signal,
  });
  const better = betterRoads(roads, asset, c?.spreadBps);
  const cur = roads.find((r) => r.name === asset);

  // a storm while live is worth a pop-up, once per two minutes
  const lastStorm = useRef(0);
  useEffect(() => {
    if (c?.weather === "storm" && b.armed && !b.sitOut && Date.now() - lastStorm.current > 120_000) {
      lastStorm.current = Date.now();
      radio({ kind: "tip", tone: "warn", title: `Storm on ${asset}`, body: c.advice });
    }
  }, [c?.weather, c?.advice, b.armed, b.sitOut, asset]);

  if (!c) return null;
  const w = W[c.weather];

  if (compact && !open)
    return (
      <button onClick={() => setOpen(true)} className={`display pointer-events-auto flex items-center gap-2 border-2 bg-ink/85 px-2.5 py-1.5 text-[10.5px] font-black uppercase backdrop-blur-md ${w.cls}`}>
        <span className={`h-2 w-2 rounded-full ${w.dot} ${c.weather === "storm" ? "animate-pulse" : ""}`} />
        pit wall · {w.label}
        {b.sitOut && <span className="text-flat">· sitting out</span>}
      </button>
    );

  return (
    <div className={`pointer-events-auto border-2 bg-ink/90 backdrop-blur-md ${compact ? "w-[min(320px,86vw)]" : "w-full"} ${w.cls.split(" ")[0]}`}>
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className={`display flex items-center gap-2 text-[10.5px] font-black uppercase tracking-[0.12em] ${w.cls.split(" ")[1]}`}>
          <span className={`h-2 w-2 rounded-full ${w.dot} ${c.weather === "storm" ? "animate-pulse" : ""}`} /> pit wall · {asset}
        </span>
        {compact && (
          <button onClick={() => setOpen(false)} className="text-[11px] text-flat hover:text-bone" aria-label="collapse">
            ▾
          </button>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className={`display text-[13px] font-black ${w.cls.split(" ")[1]}`}>{c.headline}</div>
        <p className="mt-1 text-[12px] leading-snug text-bone">{c.advice}</p>
        <div className="font-telemetry mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
          <Num k="spread" v={`${c.spreadBps.toFixed(1)}bp`} />
          <Num k="round trip" v={`${c.hurdleBps.toFixed(1)}bp`} />
          <Num k="30s swing" v={`${c.swingBps.toFixed(1)}bp`} />
          <Num k="funding" v={cur ? `${cur.fundPct >= 0 ? "+" : "−"}${Math.abs(cur.fundPct).toFixed(4)}%` : "n/a"} />
        </div>
        {b.armed && (
          <button
            onClick={() => b.setSitOut(!b.sitOut)}
            className={`display mt-2.5 w-full border-2 px-3 py-2 text-[11px] font-black uppercase ${b.sitOut ? "border-chart bg-chart text-ink" : c.weather === "storm" ? "border-blood bg-blood text-ink" : "border-steel text-bone hover:border-papaya"}`}
          >
            {b.sitOut ? "▶ back in · lanes trade again" : "⏸ sit out · close and hold flat"}
          </button>
        )}
        {better.length > 0 && (
          <div className="mt-2.5 border-t border-hairline pt-2">
            <div className="display text-[9.5px] font-bold uppercase tracking-[0.14em] text-flat">better roads on Perpl now</div>
            {better.map((r) => (
              <div key={r.name} className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11.5px] leading-snug text-flat">
                  <b className="text-bone">{r.name}</b> · {r.why}
                </span>
                <button onClick={() => onSwitch(r.name)} className="display shrink-0 border-2 border-papaya px-2 py-1 text-[10px] font-black uppercase text-papaya hover:bg-papaya hover:text-ink">
                  {b.armed ? "end & switch" : "switch"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Num({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-hairline px-1 py-1">
      <div className="text-[8.5px] uppercase tracking-wide text-flat">{k}</div>
      <div className="text-[11px] font-bold text-bone">{v}</div>
    </div>
  );
}
