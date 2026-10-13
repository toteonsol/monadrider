"use client";
/**
 * Road conditions · what the market under you is doing right now, in words a
 * newcomer can act on, and which other Perpl roads are better to ride.
 *
 *   spread      what it costs to cross the book, in basis points
 *   hurdle      a full round trip: spread + two taker fees; moves smaller lose
 *   swing       the last 30 seconds' high-low range, in basis points
 *   weather     CALM · CHOPPY · STORM, judged against your stop and the hurdle
 */
import { useEffect, useState } from "react";
import { PERPL } from "./perpl/config";

export type Weather = "calm" | "choppy" | "storm";

export interface Conditions {
  spreadBps: number;
  hurdleBps: number;
  swingBps: number;
  weather: Weather;
  headline: string;
  advice: string;
}

export function readConditions(opts: { series: number[]; bid: number; ask: number; takerBps: number; stopPct: number; signal: number }): Conditions | null {
  const { series, bid, ask, takerBps, stopPct, signal } = opts;
  const mid = bid && ask ? (bid + ask) / 2 : series[series.length - 1];
  if (!mid || series.length < 20) return null;
  const spreadBps = bid && ask ? ((ask - bid) / mid) * 1e4 : 0;
  const hurdleBps = spreadBps + 2 * takerBps;
  const last = series.slice(-60); // 30s at 2 samples/s
  const swingBps = ((Math.max(...last) - Math.min(...last)) / mid) * 1e4;
  const stopBps = stopPct * 100;

  let weather: Weather = "calm";
  if (swingBps >= stopBps * 0.6) weather = "storm";
  else if (swingBps < hurdleBps * 1.2 || Math.abs(signal) < 0.15) weather = "choppy";

  const headline =
    weather === "storm"
      ? `Storm · ${swingBps.toFixed(0)} bps swings in 30s`
      : weather === "choppy"
        ? swingBps < hurdleBps * 1.2
          ? `Choppy · moves (${swingBps.toFixed(1)} bps) under the ${hurdleBps.toFixed(1)} bps cost`
          : "Choppy · no side is winning"
        : `Calm · clean ${signal > 0 ? "up" : "down"}-swell, ${swingBps.toFixed(1)} bps range`;
  const advice =
    weather === "storm"
      ? `Swings this size can reach your ${stopPct}% stop in seconds. Sit out on the line until it settles, or widen the stop.`
      : weather === "choppy"
        ? swingBps < hurdleBps * 1.2
          ? "A round trip costs more than the market is moving. Hold one lane longer, or ride a tighter book."
          : "Buyers and sellers are trading blows. Flat is a position too."
        : `${signal > 0 ? "Buyers" : "Sellers"} have the swell. Ride ${signal > 0 ? "the crest (long)" : "the trough (short)"} with them, and let the stop do its job.`;
  return { spreadBps, hurdleBps, swingBps, weather, headline, advice };
}

export interface Road {
  name: string;
  spreadBps: number;
  move24: number;
  fundPct: number;
}

/** Every Perpl market's spread, day move and funding, refreshed every 15s. */
export function useRoads(): Road[] {
  const [roads, setRoads] = useState<Road[]>([]);
  useEffect(() => {
    let dead = false;
    const read = async () => {
      try {
        const d = (await fetch(`/api/perpl/context${PERPL.isTestnet ? "?testnet=true" : ""}`).then((r) => r.json())) as {
          markets?: { name: string; config?: { price_decimals?: number }; state?: { bid?: string; ask?: string; mid?: string; prv?: string }; funding?: { rate?: number } }[];
        };
        const rows = (d.markets ?? [])
          .map((m) => {
            const s = 10 ** (m.config?.price_decimals ?? 0);
            const bid = Number(m.state?.bid ?? 0) / s;
            const ask = Number(m.state?.ask ?? 0) / s;
            const mid = Number(m.state?.mid ?? 0) / s;
            const prv = Number(m.state?.prv ?? 0) / s;
            return {
              name: m.name,
              spreadBps: bid && ask && mid ? ((ask - bid) / mid) * 1e4 : 99,
              move24: mid && prv ? ((mid - prv) / prv) * 100 : 0,
              fundPct: Number(m.funding?.rate ?? 0) / 1e4,
            };
          })
          .filter((r) => r.name && r.spreadBps < 99);
        if (!dead) setRoads(rows);
      } catch {}
    };
    void read();
    const t = setInterval(read, 15_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);
  return roads;
}

/** Up to two roads better than `current`, each with the reason in numbers. */
export function betterRoads(roads: Road[], current: string, liveSpreadBps?: number): { name: string; why: string }[] {
  const found = roads.find((r) => r.name === current);
  if (!found) return [];
  // the road you're on: its live spread, so the panel and the pointer agree
  const cur = liveSpreadBps && liveSpreadBps > 0 ? { ...found, spreadBps: liveSpreadBps } : found;
  const out: { name: string; why: string }[] = [];
  const cheaper = roads.filter((r) => r.name !== current && r.spreadBps < cur.spreadBps * 0.5).sort((a, b) => a.spreadBps - b.spreadBps)[0];
  if (cheaper) out.push({ name: cheaper.name, why: `spread ${cheaper.spreadBps.toFixed(1)} bps vs ${cur.spreadBps.toFixed(1)} on ${current} · ${Math.round(cur.spreadBps / Math.max(0.1, cheaper.spreadBps))}× cheaper to cross` });
  const mover = roads.filter((r) => r.name !== current && r.name !== cheaper?.name).sort((a, b) => Math.abs(b.move24) - Math.abs(a.move24))[0];
  if (mover && Math.abs(mover.move24) > Math.abs(cur.move24) + 1) out.push({ name: mover.name, why: `${mover.move24 >= 0 ? "+" : "−"}${Math.abs(mover.move24).toFixed(1)}% today vs ${cur.move24 >= 0 ? "+" : "−"}${Math.abs(cur.move24).toFixed(1)}% · a stronger swell` });
  return out.slice(0, 2);
}
