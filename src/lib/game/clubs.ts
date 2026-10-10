/**
 * The volume clubs · lifetime real volume milestones, one list for every
 * surface that draws the road to the next one (the hub, the rides, the public
 * career page). Three copies of this array lived in three files.
 */
export const CLUBS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

export const fmtClub = (v: number) => (v >= 1_000_000 ? `$${v / 1_000_000}M` : v >= 1000 ? `$${v / 1000}K` : `$${v}`);

/** where a lifetime volume sits between the club it holds and the next · null past the last */
export function clubProgress(volume: number): { prev: number; next: number; pct: number } | null {
  const next = CLUBS.find((x) => volume < x);
  if (next == null) return null;
  const prev = [...CLUBS].reverse().find((x) => volume >= x) ?? 0;
  return { prev, next, pct: Math.min(1, Math.max(0, (volume - prev) / (next - prev))) };
}
