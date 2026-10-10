"use client";

/**
 * 🏁 THE RACE, WHILE IT RUNS · how far to the finish line, how much fuel is
 * left — the plan's target and loss limit, drawn live.
 *
 * Both numbers stopped the ride by themselves but were only ever SEEN before
 * GO LIVE: during the ride the target and the limit lived in a check nobody
 * could look at, and hitting one was a five-second toast. Now the ride shows
 * the car on its way to the flag (with the pace it is really doing) and the
 * tank draining as the session loses, using exactly the numbers the engine's
 * own stop reads. With a ride length set, a third lane: the clock, how long
 * is left and the volume the pace so far will reach by the end.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Car } from "./viz/Viz";
import { clockLabel, rideLengthLabel } from "@/lib/game/ridePlanRules";

const short = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `$${Math.round(n)}`);
const hours = (mins: number) =>
  mins < 90 ? `${Math.max(1, Math.round(mins))} min` : mins < 60 * 36 ? `${(mins / 60).toFixed(1)} h` : `${Math.round(mins / 60 / 24)} days`;

export default function RaceProgress({
  volume,
  net,
  targetUsd,
  maxLossUsd,
  durationMin = 0,
  startedAt,
  compact = false,
}: {
  /** the session's volume so far · the number the finish line is checked against */
  volume: number;
  /** the session's net so far, fees counted once · the number the limit is checked against */
  net: number;
  targetUsd: number;
  maxLossUsd: number;
  /** the ride's length, minutes · 0 = until stopped */
  durationMin?: number;
  /** GO LIVE time · for the pace */
  startedAt: number | null;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  // the clock lane ticks once a second while a length is set
  const [, tick] = useState(0);
  useEffect(() => {
    if (!(durationMin > 0) || !startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [durationMin, startedAt]);
  if (!(targetUsd > 0) && !(maxLossUsd > 0) && !(durationMin > 0)) return null;
  const done = targetUsd > 0 ? Math.min(1, volume / targetUsd) : 0;
  const elapsedMin = startedAt ? (Date.now() - startedAt) / 60_000 : 0;
  const pacePerMin = elapsedMin > 1 && volume > 0 ? volume / elapsedMin : null;
  const etaMin = pacePerMin && targetUsd > volume ? (targetUsd - volume) / pacePerMin : null;
  const used = maxLossUsd > 0 ? Math.max(0, -net) / maxLossUsd : 0;
  const fuelTone = used > 0.8 ? "bg-blood" : used > 0.5 ? "bg-amber" : "bg-chart";
  const text = compact ? "text-[9.5px]" : "text-[10.5px]";
  const lenMs = durationMin > 0 ? durationMin * 60_000 : 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const leftMs = lenMs > 0 ? Math.max(0, lenMs - elapsedMs) : 0;
  const clockDone = lenMs > 0 ? Math.min(1, elapsedMs / lenMs) : 0;
  const byEnd = pacePerMin && lenMs > 0 ? volume + pacePerMin * (leftMs / 60_000) : null;
  return (
    <div className={`w-full ${compact ? "space-y-1" : "space-y-1.5"}`} role="group" aria-label="race progress">
      {durationMin > 0 && (
        <div>
          <div className="relative h-[8px] w-full bg-steel/50" role="img" aria-label={`${Math.round(clockDone * 100)}% of the ${rideLengthLabel(durationMin)} ride`}>
            <motion.div className="absolute inset-y-0 left-0 bg-sky/80" initial={false} animate={{ width: `${clockDone * 100}%` }} transition={reduce ? { duration: 0 } : { duration: 0.8 }} />
          </div>
          <div className={`mt-0.5 flex flex-wrap justify-between gap-x-2 ${text} tabular-nums text-flat`}>
            <span>
              ⏱ {leftMs > 0 ? <><b className="text-bone">{clockLabel(leftMs)}</b> left of {rideLengthLabel(durationMin)}</> : <b className="text-chart">time · stopping</b>}
            </span>
            <span>{byEnd != null ? <>≈ {short(byEnd)} by the end at this pace</> : "pace after the first minute"}</span>
          </div>
        </div>
      )}
      {targetUsd > 0 && (
        <div>
          <div className="relative h-[14px] w-full">
            <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 bg-steel/70" />
            <motion.div
              className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 bg-chart"
              initial={false}
              animate={{ width: `${done * 100}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            />
            <motion.span
              className="absolute top-0"
              initial={false}
              animate={{ left: `calc(${done * 100}% - ${done * 18}px)` }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 80, damping: 18 }}
            >
              <Car tone="papaya" size={18} />
            </motion.span>
            <span className="flag absolute right-0 top-0 h-[14px] w-4" aria-hidden />
          </div>
          <div className={`mt-0.5 flex flex-wrap justify-between gap-x-2 ${text} tabular-nums text-flat`}>
            <span>
              <b className="text-bone">{short(volume)}</b> of {short(targetUsd)} · {Math.round(done * 100)}%
            </span>
            <span>{done >= 1 ? <b className="text-chart">at the flag</b> : etaMin != null ? <>≈ {hours(etaMin)} to the flag</> : "pace after the first minute"}</span>
          </div>
        </div>
      )}
      {maxLossUsd > 0 && (
        <div>
          <div className="flex h-[8px] w-full gap-[2px]" role="img" aria-label={`fuel used ${Math.round(used * 100)}%`}>
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={`h-full flex-1 ${i < Math.ceil((1 - Math.min(1, used)) * 20) ? fuelTone : "bg-steel/50"}`} />
            ))}
          </div>
          <div className={`mt-0.5 flex flex-wrap justify-between gap-x-2 ${text} tabular-nums text-flat`}>
            <span>
              fuel {net >= 0 ? <b className="text-chart">full · ahead +${net.toFixed(2)}</b> : <>used <b className={used > 0.5 ? "text-amber" : "text-bone"}>${(-net).toFixed(2)}</b> of ${maxLossUsd}</>}
            </span>
            <span>{used >= 1 ? <b className="text-blood">empty · stopping</b> : `${Math.round((1 - used) * 100)}% left`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
