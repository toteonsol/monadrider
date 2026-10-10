/**
 * 🧭 MILESTONES · which parts of the app this rider has actually used.
 *
 * The journey card walks a rider through the features one after another
 * (free lap → live ride → Passenger → a second road → All Roads → the desk →
 * a convoy → an invite) and ticks each off from what they have DONE, never
 * from what they clicked past. Most steps can be read from records that
 * already exist (rides, road keys); the rest are marked the moment the thing
 * happens, by the surface where it happens.
 *
 * Local to this browser on purpose: it is a guide, not a score — nothing
 * here is a claim to anyone else.
 */

export type Milestone = "passenger" | "allroads" | "desk" | "convoy" | "invite";

const KEY = "rtn-milestones";

function read(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markMilestone(m: Milestone): void {
  try {
    const cur = read();
    if (cur[m]) return;
    cur[m] = Date.now();
    localStorage.setItem(KEY, JSON.stringify(cur));
    window.dispatchEvent(new CustomEvent("rtn-milestone", { detail: m }));
  } catch {
    /* private mode · the journey simply won't tick this one */
  }
}

export function hasMilestone(m: Milestone): boolean {
  return !!read()[m];
}
