/**
 * ⏱⛽ A RIDE'S PLAN, AS RULES · how long it runs, where it finishes, what it
 * may spend. Shared by the ride plan, the gear sheet, the live race, the plan
 * bar and the stop that enforces them (LiveLayer), so the number promised
 * before GO LIVE is the number that ends the ride.
 *
 * The rider (2026-10-05), about the desk: "i only saw when the reruns should
 * happen, not how long … you can't set custom days". A ride had no length at
 * all, and its fuel limit lived in a sheet a set-up rider never opened. Same
 * lesson, same fix: the length is set where the ride is set up, with custom
 * values, and the limit is suggested from the ride's own numbers.
 */

/** the lengths offered as one tap, in minutes */
export const RIDE_LENGTHS_MIN = [15, 30, 60, 240] as const;
/** a ride trades from an open tab (Passenger pauses in a hidden one), so a
 *  day is the ceiling a length can be typed to */
export const RIDE_MAX_MIN = 24 * 60;

export const rideLengthLabel = (min: number) =>
  min < 60 ? `${Math.round(min)} min` : min % 60 === 0 ? `${min / 60} h` : `${+(min / 60).toFixed(1)} h`;

/** time left, said the way a clock is read: "42 min", "3 h 05", "20 s" */
export const clockLabel = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/* WHICH ROADS READ A RIDE'S PRICE RESULT LIVE · the equity, collateral or
   realized fills useLiveTrading reads every few seconds. Elsewhere the live
   number is the fees alone (a resting grid's fills carry no prices) and the
   venues are checked after the ride, so a fuel limit there can only stop on
   fees, and it says so. */
const PNL_LIVE = new Set(["hyperliquid", "hotstuff", "arcus", "perpl", "lighter", "lightermain", "phoenix"]);
export const pnlReadLive = (venue: string | null | undefined) => !!venue && PNL_LIVE.has(venue);

export function rideEndsAt(startedAt: number | null | undefined, durationMin: number): number | null {
  return startedAt && durationMin > 0 ? startedAt + durationMin * 60_000 : null;
}

/** volume over a stretch at a pace · null when the pace is not known */
export const volumeOver = (perHour: number | null | undefined, mins: number): number | null =>
  perHour != null && perHour > 0 && mins > 0 ? (perHour * mins) / 60 : null;

/** the volume the plan is for · the finish line, the run length at today's
 *  pace, or whichever of the two comes first · null when neither says */
export function planVolume(o: { distanceUsd: number; durationMin: number; perHour: number | null }): number | null {
  const byTime = o.durationMin > 0 ? volumeOver(o.perHour, o.durationMin) : null;
  if (o.distanceUsd > 0 && byTime != null) return Math.min(o.distanceUsd, byTime);
  if (o.distanceUsd > 0) return o.distanceUsd;
  return byTime;
}

/** which line ends the plan first, when both are set and the pace is known */
export function firstLine(o: { distanceUsd: number; durationMin: number; perHour: number | null }): "distance" | "clock" | null {
  if (!(o.distanceUsd > 0) || !(o.durationMin > 0)) return o.distanceUsd > 0 ? "distance" : o.durationMin > 0 ? "clock" : null;
  const byTime = volumeOver(o.perHour, o.durationMin);
  if (byTime == null) return null; // pace unknown · either could
  return byTime < o.distanceUsd ? "clock" : "distance";
}

/** dollars a person would type: 50¢ steps to $5, dollars to $20, fives to
 *  $100, then twenty-fives · always rounded UP, never under the ask */
export function niceFuel(x: number): number {
  if (!(x > 0)) return 0;
  if (x <= 5) return Math.ceil(x * 2) / 2;
  if (x <= 20) return Math.ceil(x);
  if (x <= 100) return Math.ceil(x / 5) * 5;
  return Math.ceil(x / 25) * 25;
}

/** THE SUGGESTED FUEL LIMIT.
 *  With volume to plan on: what that volume should cost in this car (volume ×
 *  $/1M) and half again, never under three worst laps (one bad stretch is
 *  not a reason to stop) nor under a dollar. With nothing to plan on (open
 *  distance, no length, or a pace nobody measured): five worst laps · a stop
 *  for a bad tape, not a budget. Null when neither was read. */
export function smartFuel(o: { costPerM: number | null; volumeUsd: number | null; worstLapUsd: number | null }): { usd: number; why: "plan" | "laps" } | null {
  const lap = o.worstLapUsd != null && o.worstLapUsd > 0 ? o.worstLapUsd : null;
  if (o.costPerM != null && o.costPerM > 0 && o.volumeUsd != null && o.volumeUsd > 0) {
    const cost = (o.volumeUsd * o.costPerM) / 1e6;
    return { usd: niceFuel(Math.max(1, 1.5 * cost, 3 * (lap ?? 0))), why: "plan" };
  }
  if (lap) return { usd: niceFuel(Math.max(1, 5 * lap)), why: "laps" };
  return null;
}
