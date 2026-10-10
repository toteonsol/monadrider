/**
 * bounties · the DAILY SET, the come-back-tomorrow engine (stickiness v1).
 *
 * Three bounties a day, rotated deterministically from the date (everyone
 * sees the same set, "today's set" is shared culture, like a daily puzzle).
 * Progress accrues from ANY cartridge (Ride and Surfer both bump the same
 * counters), persists in localStorage, and resets at midnight, which is the
 * hook: an unfinished set expires, a finished one asks you to defend the
 * streak tomorrow. Completing all three PAYS REAL POINTS, 500 + 100 ×
 * (streak − 1), capped 1,500/day, recorded as an honest "bonus" entry
 * (visible in history, submitted to the board) exactly once per day.
 */
import { saveBonus } from "./rideLog";
import { submitRide } from "./backend";

export type BountyKind =
  | "km" // Ride · total km today
  | "coins" // Ride · coins banked
  | "gems" // any world · whale gems banked
  | "nearmiss" // Ride · near-miss saves
  | "erupt" // Ride · survive an eruption
  | "combo3" // Ride · hit a ×3 combo
  | "surf_m" // Surfer · meters surfed today
  | "surf_coins" // Surfer · coins on the face
  | "surf_air" // Surfer · aerials landed
  | "pulse_hits" // Pulse · pads hit on the beat
  | "pulse_perfect"; // Pulse · perfect-window hits

interface BountyDef {
  kind: BountyKind;
  target: number;
  label: string;
  world: "ride" | "surf" | "pulse" | "any";
}

const POOL: BountyDef[] = [
  { kind: "km", target: 6, label: "ride 6 km", world: "ride" },
  { kind: "coins", target: 40, label: "bank 40 coins on the road", world: "ride" },
  { kind: "gems", target: 2, label: "catch 2 whale gems", world: "any" },
  { kind: "nearmiss", target: 3, label: "shave 3 near-misses", world: "ride" },
  { kind: "erupt", target: 1, label: "survive an eruption", world: "ride" },
  { kind: "combo3", target: 1, label: "heat a ×3 combo", world: "ride" },
  { kind: "surf_m", target: 1500, label: "surf 1,500 m", world: "surf" },
  { kind: "surf_coins", target: 25, label: "bank 25 coins on the face", world: "surf" },
  { kind: "surf_air", target: 3, label: "land 3 aerials", world: "surf" },
  { kind: "pulse_hits", target: 30, label: "hit 30 pads on the beat", world: "pulse" },
  { kind: "pulse_perfect", target: 8, label: "land 8 PERFECT hits", world: "pulse" },
];

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const PROG_KEY = () => `rtn-bounties-${dayKey()}`;
const STREAK_KEY = "rtn-bounty-streak"; // { lastDone: "YYYY-MM-DD", n: number }

/** Deterministic daily pick: date-seeded shuffle → 3 bounties, at most one
 *  per world-specific bucket so a set never demands only one cartridge. */
export function todaysBounties(): (BountyDef & { progress: number; done: boolean })[] {
  let seed = 0;
  for (const c of dayKey()) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const shuffled = [...POOL].sort(() => rand() - 0.5);
  const picked: BountyDef[] = [];
  for (const b of shuffled) {
    if (picked.length >= 3) break;
    // keep the set playable across cartridges: max 2 from the same world
    if (picked.filter((p) => p.world === b.world).length >= 2) continue;
    picked.push(b);
  }
  const prog = readProgress();
  return picked.map((b) => ({
    ...b,
    progress: Math.min(b.target, prog[b.kind] ?? 0),
    done: (prog[b.kind] ?? 0) >= b.target,
  }));
}

function readProgress(): Partial<Record<BountyKind, number>> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PROG_KEY()) ?? "{}");
  } catch {
    return {};
  }
}

/** Bump a counter from gameplay (any cartridge). Cheap + safe to call often. */
export function bumpBounty(kind: BountyKind | string, n: number): void {
  if (typeof window === "undefined" || n <= 0) return;
  try {
    const p = readProgress() as Record<string, number>;
    p[kind] = (p[kind] ?? 0) + n;
    localStorage.setItem(PROG_KEY(), JSON.stringify(p));
    // set-complete? stamp the streak + PAY THE BONUS · exactly once per day
    const set = todaysBounties();
    if (set.length === 3 && set.every((b) => b.done)) {
      const s = readStreak();
      if (s.lastDone !== dayKey()) {
        const yesterday = new Date(Date.now() - 864e5);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const n2 = s.lastDone === yKey ? s.n + 1 : 1;
        localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDone: dayKey(), n: n2 }));
        const bonus = Math.min(1500, 500 + 100 * (n2 - 1));
        const rec = saveBonus(bonus);
        submitRide(rec); // the board counts it like any ride
        localStorage.setItem("rtn-bounty-bonus", JSON.stringify({ day: dayKey(), pts: bonus }));
      }
    }
  } catch {
    /* storage unavailable · bounties are a bonus layer, never a blocker */
  }
}

export function readStreak(): { lastDone: string; n: number } {
  if (typeof window === "undefined") return { lastDone: "", n: 0 };
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) ?? '{"lastDone":"","n":0}');
  } catch {
    return { lastDone: "", n: 0 };
  }
}

/** True once all three of today's bounties are complete. */
export function setComplete(): boolean {
  const set = todaysBounties();
  return set.length === 3 && set.every((b) => b.done);
}

/** Today's paid set bonus (0 if the set isn't closed yet). */
export function todaysBonus(): number {
  if (typeof window === "undefined") return 0;
  try {
    const b = JSON.parse(localStorage.getItem("rtn-bounty-bonus") ?? "{}");
    return b.day === dayKey() ? (b.pts ?? 0) : 0;
  } catch {
    return 0;
  }
}
