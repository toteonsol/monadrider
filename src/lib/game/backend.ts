/**
 * backend · client for this repo's own game server (relay/game.mjs): the
 * Paddock's rides, standings, streaks and percentiles.
 *
 * Same calls the RIDE / SURFER / PULSE worlds already make. A live ride is
 * submitted with the Monad tx hashes of its Perpl orders, and the server only
 * counts it as live once those transactions check out onchain.
 * Every call no-ops quietly when the server is unreachable.
 */
import type { RideRecord } from "./rideLog";
import { myCode, riderIdFor } from "./referral";
import { getRideAddress } from "@/lib/ride/session";
import { getRideAsset } from "./liveFeed";

const base = (process.env.NEXT_PUBLIC_GAME_API || "http://localhost:8787").replace(/\/$/, "");
export const backendEnabled = !!base;

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export function submitRide(rec: RideRecord) {
  // live rides are submitted by the live engine itself (submitLiveRide), with
  // their Monad txs, whichever way the ride ended; the worlds send practice
  if (rec.live) return;
  const txids: string[] = [];
  const address = rec.address ?? (rec.live ? getRideAddress() : null);
  void fetch(`${base}/api/rides`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rider: riderIdFor(address),
      address,
      mode: rec.mode,
      asset: rec.asset ?? getRideAsset(),
      live: rec.live,
      points: rec.points,
      simVolume: Math.round(rec.sim.volume),
      realVolume: rec.real.volume,
      realFees: rec.real.fees,
      realPnl: rec.real.pnl,
      fills: rec.real.fills,
      crashes: rec.sim.crashes,
      txids,
    }),
  })
    .catch(() => {});
}

export interface TopRider {
  rider: string;
  points: number;
  realVolume: number;
  rides: number;
  realFees?: number;
  realPnl?: number;
}

/** top riders by points · windowMs omitted = last 24h, 0 = all time */
export const fetchTop = (limit = 5, windowMs?: number): Promise<TopRider[]> =>
  get(`/api/top?limit=${limit}${windowMs != null ? `&windowMs=${windowMs}` : ""}`, []);

export interface RecentRide {
  ts: number;
  rider: string;
  mode: string;
  live: boolean;
  venue: string | null;
  asset?: string | null;
  realVolume: number;
  realPnl: number | null;
  fills: number | null;
  points: number;
  /** first verified Monad tx of a live ride */
  tx?: string | null;
}
export const fetchRecentRides = (sinceMs = 24 * 3600_000): Promise<RecentRide[]> => get(`/api/recent?sinceMs=${sinceMs}`, []);

export interface FieldWindow {
  key: string;
  ms: number;
  summary: { rides: number; riders: number; liveRiders: number; liveRides: number; realVolume: number; points: number } | null;
}
export const fetchFieldSummary = (): Promise<FieldWindow[]> => get("/api/field", []);

export const fetchPercentile = (points: number): Promise<number | null> => get(`/api/percentile?points=${points}`, null);

export const fetchStreak = (): Promise<number> => get(`/api/streak?rider=${encodeURIComponent(myCode())}`, 0);

/** claimed rider names · this edition has no name claims yet, so every rider shows their generated alias */
export const fetchClaimedNames = async (_codes: string[]): Promise<{ code: string; name: string }[]> => [];

/** A live ride, straight from the engine when it ends: the server verifies
 *  every tx before it counts. Points: 1 per $1 of real volume. */
export function submitLiveRide(r: {
  owner: string | null;
  mode: string;
  asset: string;
  volume: number;
  fees: number;
  pnl: number;
  fills: number;
  txids: string[];
}) {
  const address = r.owner && /^0x[0-9a-fA-F]{40}$/.test(r.owner) ? r.owner : null;
  void fetch(`${base}/api/rides`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rider: riderIdFor(address),
      address,
      mode: r.mode,
      asset: r.asset,
      live: true,
      points: Math.round(r.volume),
      realVolume: r.volume,
      realFees: r.fees,
      realPnl: r.pnl,
      fills: r.fills,
      crashes: 0,
      txids: r.txids,
    }),
  }).catch(() => {});
}
