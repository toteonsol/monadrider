/**
 * rideLog · per-ride stat records + the Hyperider points system (v1).
 *
 * Every ride saves a record pairing GAME stats with REAL trading stats, so
 * rides are comparable (to your own history now; to other riders once the
 * backend leaderboard lands) and the skill↔safety correlation is measurable.
 *
 * Points v2 (transparent, volume-first · the airdrop-farmer's currency):
 *   base   = 1 pt per $1 REAL volume  +  0.02 pt per $1 practice volume,
 *            where the practice half is CAPPED at PRACTICE_CAP per ride.
 *   skill  = ×(1 + dodges·1% + streak·2%, capped +50%) − crashes·5% (floor ×1)
 * Practice is a taste, not a farm: the cap means no amount of free-play can
 * rival one real session, so the points that matter (leaderboard, airdrop
 * narrative) reflect REAL trading. Practice still earns, the funnel needs a
 * hook, just never enough to top the board. Skill amplifies, never replaces.
 */
import { referredBy, REFERRED_BOOST } from "./referral";
import { VENUE_COUNT } from "./venues";

export interface RideRecord {
  id: string;
  ts: number; // ride end, ms
  mode: "bike" | "car" | "3d" | "surf" | "pulse" | "bonus";
  live: boolean;
  sim: { volume: number; coins: number; dodges: number; bestStreak: number; crashes: number };
  real: { fills: number; volume: number; fees: number; pnl: number };
  points: number;
  /** the venue this ride's REAL clips fired at. Optional because rides logged
   *  before venue-tagging shipped do not carry it; those roll up as "unknown"
   *  rather than being dropped from history. */
  venue?: string | null;
  /** the asset the REAL clips traded · older rides lack it and show mode */
  asset?: string | null;
  /** invite code of whoever referred this rider (credited when backend ships) */
  ref?: string | null;
  /** the wallet this ride traded with · the leaderboard's durable identity.
   *  Without it a rider is a random localStorage code: clearing the cache
   *  forks one person into many, and many wallets collapse into one. */
  address?: string | null;
}

/** On Arcus, Lighter and Phoenix a ride's P&L is the account's equity change
 *  since GO LIVE — the fees are already inside it. Elsewhere the P&L is the
 *  trades' price result and the fees come off it. Subtracting fees from an
 *  equity change counted them twice: a session showed twice its real cost and
 *  a loss limit tripped early. One rule, used everywhere a ride's net is said. */
export const feesInPnl = (venue?: string | null) => venue === "arcus" || venue === "lighter" || venue === "lightermain" || venue === "phoenix";
export const rideNet = (venue: string | null | undefined, real: { pnl: number; fees: number }) =>
  feesInPnl(venue) ? real.pnl : real.pnl - real.fees;

/** A convoy's money, as a record can honestly state it.
 *
 *  The wheel road's net is counted once (rideNet) and its price result is the
 *  net plus its fees. A SIDECAR road reports fills, volume and our builder fee
 *  — its engine never learns a price result (grid fills carry no prices) — so
 *  its "pnl − fees" was the builder fee dressed up as a net, and every sidecar
 *  read "+$0.00". No net is claimed for a sidecar; the session's net exists
 *  only when every road's does, and the Logbook checks the rest with each
 *  venue. The wheel's fees also came off an equity change on Arcus, Lighter
 *  and Phoenix — counted twice — before this went through rideNet. */
export function convoyNets(
  primary: { venue: string | null | undefined; pnl: number; fees: number },
  sidecars: { fees: number }[],
): { primaryNet: number; primaryPrice: number; netUsd: number | null; costUsd: number } {
  const primaryNet = rideNet(primary.venue, primary);
  return {
    primaryNet,
    primaryPrice: primaryNet + primary.fees,
    netUsd: sidecars.length === 0 ? primaryNet : null,
    costUsd: primary.fees + sidecars.reduce((a, s) => a + s.fees, 0),
  };
}

const KEY = "rtn-rides";
const MAX = 200;

/** Max points the PRACTICE (play-money) half of a ride can contribute, before
 *  the skill multiplier. Keeps free-play a taste, a real session scales past
 *  this immediately, so practice can never dominate the board. */
export const PRACTICE_CAP = 150;

export function computePoints(r: Omit<RideRecord, "id" | "ts" | "points" | "ref">): number {
  const realPts = r.real.volume * 1;
  const practicePts = Math.min(PRACTICE_CAP, r.sim.volume * 0.02);
  const base = realPts + practicePts;
  const mult = Math.max(
    1,
    1 +
      Math.min(0.5, r.sim.dodges * 0.01 + r.sim.bestStreak * 0.02) -
      r.sim.crashes * 0.05);
  const refBoost = referredBy() ? REFERRED_BOOST : 1;
  return Math.round(base * mult * refBoost);
}

/** One plain-words tip per ride · the rule-based co-driver, the fallback when
 *  the AI one is quiet. Speaks the app's own words (go live, Passenger, the
 *  middle = flat) and never the desk's. Works for every game: a hit is a
 *  crash, a wipeout or a strike; the red is whatever pushes against you. */
export function coachTip(r: RideRecord): string {
  const hits = r.sim.crashes;
  if (hits >= 3)
    return "You got caught a lot. When the red is coming, move early: a few seconds in the middle costs nothing, a hit closes the trade.";
  if (hits > r.sim.dodges)
    return "More hits than dodges. Sit in the middle (flat) while it looks red, and step back in when it clears.";
  if (r.live && r.real.fees > 0 && r.real.volume / Math.max(0.01, r.real.fees) < 800)
    return `Fees ran hot: $${r.real.fees.toFixed(2)} on $${Math.round(r.real.volume).toLocaleString()} of volume. Fewer flips and longer holds; Passenger rests orders instead of crossing.`;
  if (r.sim.bestStreak >= 5)
    return "That streak was expert riding: staying on the side the market is pushing is exactly the safe-volume trade.";
  if (!r.live) return "Solid practice. Go live next ride and the same driving earns real volume and full points.";
  return "Clean ride. Stay with the green, dodge the red, and let the streaks build.";
}

/* ── ONE SESSION, COUNTED ONCE ─────────────────────────────────────────────
   A game run hands over the cockpit's real numbers as they stand — and those
   are the SESSION's, cumulative since GO LIVE. Two runs in one armed session
   submitted the same trades twice to the board (volume, fees, P&L, and the
   points volume earns). The cockpit names the session at GO LIVE; each save
   records only what is new since that session's previous save. */
let liveSession: number | null = null;
const CUM_KEY = "rtn-ride-cum";
export function setLiveSession(armedAt: number) {
  if (armedAt > 0) liveSession = armedAt;
}
function sinceLastSave(cum: RideRecord["real"]): RideRecord["real"] {
  if (liveSession == null) return cum;
  try {
    const prev = JSON.parse(localStorage.getItem(CUM_KEY) ?? "null") as ({ session: number } & RideRecord["real"]) | null;
    localStorage.setItem(CUM_KEY, JSON.stringify({ session: liveSession, ...cum }));
    if (!prev || prev.session !== liveSession) return cum;
    return {
      fills: Math.max(0, cum.fills - prev.fills),
      volume: Math.max(0, cum.volume - prev.volume),
      fees: Math.max(0, cum.fees - prev.fees),
      pnl: cum.pnl - prev.pnl,
    };
  } catch {
    return cum;
  }
}

export function saveRide(input: Omit<RideRecord, "id" | "ts" | "points" | "ref">): RideRecord {
  const real = input.real.volume > 0 || input.real.fills > 0 ? sinceLastSave(input.real) : input.real;
  const r = { ...input, real, live: input.live && (real.fills > 0 || real.volume > 0) };
  // tag the road at save time from the cockpit's mirrored selection, so every
  // call site records it without each game having to thread a venue prop
  let venue: string | null = r.venue ?? null;
  // the ASSET rides the same rail — "what did this ride trade" was
  // unanswerable in the logbook because nobody wrote it down
  let asset: string | null = r.asset ?? null;
  if (!venue && r.live) {
    try {
      venue = localStorage.getItem("rtn-venue");
    } catch {
      venue = null;
    }
  }
  if (!asset && r.live) {
    try {
      asset = localStorage.getItem("rtn-asset");
    } catch {
      asset = null;
    }
  }
  const rec: RideRecord = {
    ...r,
    venue,
    asset,
    id: Math.random().toString(36).slice(2, 10),
    ts: Date.now(),
    points: computePoints(r),
    ref: referredBy(),
  };
  /* ── THE DURABLE RECEIPT MOVED TO THE SESSION ──────────────────────────
     A live ride used to write its durable record HERE, once per game run —
     stamped with one time for open and close (so no venue could ever check
     it), and carrying the session's money-so-far, which is cumulative since
     GO LIVE: two runs in one session counted the same trades twice. The ride
     hook now writes ONE receipt per armed session at STOP (useLiveTrading
     disarm · kind "ride", the real open time, the account, the mode, why it
     ended), which the Logbook checks against the venue. This local record
     stays for the game: points, the race card, the run's picture. */
  try {
    const all = listRides();
    all.push(rec);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    /* storage full/blocked · the ride still happened */
  }
  return rec;
}

/** A points AWARD outside a ride (e.g. completing the Daily Set): recorded as
 *  its own honest entry, visible in history, counted by career(), submitted
 *  to the board like any ride. Never used to fake trading stats: sim/real all
 *  zero, only `points` carries value. */
export function saveBonus(points: number): RideRecord {
  const rec: RideRecord = {
    id: Math.random().toString(36).slice(2, 10),
    ts: Date.now(),
    mode: "bonus",
    live: false,
    sim: { volume: 0, coins: 0, dodges: 0, bestStreak: 0, crashes: 0 },
    real: { fills: 0, volume: 0, fees: 0, pnl: 0 },
    points: Math.max(0, Math.round(points)),
    ref: referredBy(),
  };
  try {
    const all = listRides();
    all.push(rec);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    /* storage full/blocked */
  }
  return rec;
}

export function listRides(): RideRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RideRecord[];
  } catch {
    return [];
  }
}

export interface Career {
  rides: number;
  points: number;
  realVolume: number;
  realFees: number;
  realPnl: number;
  bestRidePoints: number;
}

export function career(): Career {
  const all = listRides();
  return {
    rides: all.length,
    points: all.reduce((a, r) => a + r.points, 0),
    realVolume: all.reduce((a, r) => a + r.real.volume, 0),
    realFees: all.reduce((a, r) => a + r.real.fees, 0),
    realPnl: all.reduce((a, r) => a + r.real.pnl, 0),
    bestRidePoints: all.reduce((a, r) => Math.max(a, r.points), 0),
  };
}


/* ═══════════════════════════════════════════════════════════════════════════
   THE RACE CARD's numbers.

   A profile that shows one lifetime total answers "how much" and nothing else.
   These helpers answer the questions a farmer actually has: how am I doing
   LATELY, which road is carrying me, what is each road COSTING me, and what
   should I do next. Everything derives from the same ride log, so no number
   here can disagree with history.
   ═══════════════════════════════════════════════════════════════════════════ */

export type WindowKey = "today" | "7d" | "30d" | "all";

export const WINDOW_LABEL: Record<WindowKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

const WINDOW_MS: Record<WindowKey, number> = {
  today: 0, // handled as "since local midnight"
  "7d": 7 * 864e5,
  "30d": 30 * 864e5,
  all: Number.POSITIVE_INFINITY,
};

export function ridesInWindow(w: WindowKey, all = listRides()): RideRecord[] {
  if (w === "all") return all;
  if (w === "today") {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return all.filter((r) => r.ts >= midnight.getTime());
  }
  const cutoff = Date.now() - WINDOW_MS[w];
  return all.filter((r) => r.ts >= cutoff);
}

export interface Totals {
  rides: number;
  liveRides: number;
  points: number;
  realVolume: number;
  realFees: number;
  realPnl: number;
  /** what the rides really made or lost, fees included once · see rideNet */
  realNet: number;
  fills: number;
  practiceVolume: number;
}

export function totals(rides: RideRecord[]): Totals {
  return rides.reduce<Totals>(
    (a, r) => ({
      rides: a.rides + 1,
      liveRides: a.liveRides + (r.live ? 1 : 0),
      points: a.points + r.points,
      realVolume: a.realVolume + r.real.volume,
      realFees: a.realFees + r.real.fees,
      realPnl: a.realPnl + r.real.pnl,
      realNet: a.realNet + rideNet(r.venue, r.real),
      fills: a.fills + r.real.fills,
      practiceVolume: a.practiceVolume + r.sim.volume,
    }),
    { rides: 0, liveRides: 0, points: 0, realVolume: 0, realFees: 0, realPnl: 0, realNet: 0, fills: 0, practiceVolume: 0 });
}

export interface VenueRow extends Totals {
  venue: string;
  /** all-in cost per $1M of real volume, the number that decides a road */
  costPerM: number | null;
}

/** Per-road rollup, richest road first. This is the breakdown that turns
 *  "I farmed some volume" into "THIS road is carrying me and THAT one is
 *  costing me". */
export function byVenue(rides: RideRecord[]): VenueRow[] {
  const map = new Map<string, RideRecord[]>();
  for (const r of rides) {
    if (!r.live) continue; // practice has no venue and no cost
    const key = r.venue || "unknown";
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([venue, list]) => {
      const t = totals(list);
      // cost = fees paid MINUS pnl earned: a rebate road can come out negative,
      // which is the honest answer, not a floor at zero.
      const net = -t.realNet;
      return {
        venue,
        ...t,
        costPerM: t.realVolume > 0 ? (net / t.realVolume) * 1e6 : null,
      };
    })
    .sort((a, b) => b.realVolume - a.realVolume);
}

export interface Nudge {
  tone: "opportunity" | "warning" | "streak";
  headline: string;
  body: string;
  /** where this nudge sends you */
  action?: { label: string; go: "trade" | "garage" | "research" | "campaigns" };
}

/** THE DIRECTIONAL LAYER · what the profile should be TELLING you.
 *  Every nudge is derived from your own logged rides, never invented, and each
 *  one names the next move rather than just stating a number. */
export function nudges(opts: {
  all: RideRecord[];
  venuesReady: number;
  streakDays: number;
}): Nudge[] {
  const { all, venuesReady, streakDays } = opts;
  const out: Nudge[] = [];
  const life = totals(all);
  const week = totals(ridesInWindow("7d", all));
  const rows = byVenue(all);

  // 1. never gone live: the single biggest gap there is
  if (life.liveRides === 0) {
    out.push({
      tone: "opportunity",
      headline: "You have not farmed a real ride yet",
      body:
        life.practiceVolume > 0
          ? `You have driven $${Math.round(life.practiceVolume).toLocaleString()} in practice. Live, that same driving earns the venue's airdrop points and counts on the leaderboard. Practice points are capped at ${PRACTICE_CAP} per ride on purpose.`
          : "Practice is free and needs no wallet. When you are ready, going live takes about two minutes and every lane becomes a small, capped, auto-closed real trade.",
      action: { label: "Go to Trade →", go: "trade" },
    });
  }

  // 2. only one road set up: All Roads is the multiplier they are missing ·
  //    with none set up, nudge 1 already says "go live" (this said "One road
  //    set up" to riders who had none)
  if (venuesReady === 1) {
    out.push({
      tone: "opportunity",
      headline: `One road set up, ${VENUE_COUNT - 1} left on the table`,
      body:
        "Every venue runs its own airdrop. A second bay unlocks ALL ROADS, where one drive farms several venues at once instead of one.",
      action: { label: "Set up another bay →", go: "garage" },
    });
  } else if (venuesReady > 1 && rows.length === 1 && life.liveRides > 0) {
    out.push({
      tone: "opportunity",
      headline: `All your volume is on one road`,
      body: `You have ${venuesReady} bays ready but every logged ride farmed ${rows[0].venue}. ALL ROADS rides them together, so the same drive earns each venue's points.`,
      action: { label: "Turn on all roads →", go: "trade" },
    });
  }

  // 3. an expensive road, named with its own measured number
  const pricey = rows.filter((r) => r.costPerM !== null && r.realVolume > 5000).sort((a, b) => (b.costPerM ?? 0) - (a.costPerM ?? 0))[0];
  const cheap = rows.filter((r) => r.costPerM !== null && r.realVolume > 5000).sort((a, b) => (a.costPerM ?? 0) - (b.costPerM ?? 0))[0];
  if (pricey && cheap && pricey.venue !== cheap.venue && (pricey.costPerM ?? 0) > (cheap.costPerM ?? 0) + 40) {
    out.push({
      tone: "warning",
      headline: `${pricey.venue} is your most expensive road`,
      body: `It has cost you $${Math.round(pricey.costPerM ?? 0)} per $1M farmed, against $${Math.round(cheap.costPerM ?? 0)} on ${cheap.venue}. Same volume, cheaper road.`,
      action: { label: "Check the Lab →", go: "research" },
    });
  }

  // 4. gone quiet: say it plainly, with what it is costing
  if (life.liveRides > 0 && week.rides === 0) {
    out.push({
      tone: "warning",
      headline: "No rides in the last 7 days",
      body: "Airdrop seasons reward consistency, and every quiet week is volume the leaderboard is counting for someone else.",
      action: { label: "Take a lap →", go: "trade" },
    });
  }

  // 5. the streak, framed as a thing to defend
  if (streakDays >= 2) {
    out.push({
      tone: "streak",
      headline: `${streakDays}-day streak running`,
      body: "Ride today to keep it alive. Streaks compound your daily set bonus.",
      action: { label: "Keep it going →", go: "trade" },
    });
  }

  // 6. campaigns they may not know are live
  if (life.liveRides > 0) {
    out.push({
      tone: "opportunity",
      headline: "Check what each venue is paying right now",
      body: "Campaign terms move week to week. The airdrop board shows every live programme and how to farm it.",
      action: { label: "Open the airdrop board →", go: "campaigns" },
    });
  }

  return out;
}
