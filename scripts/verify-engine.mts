/**
 * Safety-rail checks for the ride engine, on scripted price paths.
 *   pnpm verify:engine
 */
import { RideEngine, PaperExecutor, DEFAULT_RAILS, RAIL_LIMITS, clampRails } from "../src/lib/ride/engine";

let failed = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failed++;
};
const rails = { ...DEFAULT_RAILS, throttleMs: 0 };

async function run(path: number[], targets: Record<number, -1 | 0 | 1>, r = rails) {
  const e = new RideEngine(new PaperExecutor(0), r);
  e.start();
  for (let i = 0; i < path.length; i++) {
    if (targets[i] !== undefined) e.setTarget(targets[i]);
    await e.tick(path[i]);
    // throttle is wall-clock; step past it
    (e as unknown as { lastOrderAt: number }).lastOrderAt = 0;
  }
  return e;
}

{
  const e = await run([100, 100, 101, 102], { 0: 1 });
  check("long opens on target and tracks P&L", e.state.band === 1 && e.state.size > 0);
  await e.end(102);
  check("end flattens and books the gain", e.state.size === 0 && e.state.realized > 0 && e.state.status === "ended");
}
{
  const e = await run([100, 100, 99.3], { 0: 1 });
  check("stop: a 0.7% move against a long is a wipeout to flat", e.state.wipeouts === 1 && e.state.band === 0 && e.state.size === 0);
}
{
  const big = { ...rails, clipUsd: 100, lossLimitUsd: 1, stopPct: 5 };
  const e = await run([100, 100, 99, 98.5], { 0: 1 }, big);
  check("max loss ends the ride and flattens", e.state.status === "ended" && e.state.endReason === "loss-limit" && e.state.size === 0);
}
{
  const e = await run([100, 100, 100, 100], { 0: 1, 2: -1 });
  check("flip long → short goes through flat (close, then open)", e.state.band === -1 && e.state.fills.map((f) => f.action).join() === "open-long,close,open-short");
}
{
  const c = clampRails({ clipUsd: 10_000, stopPct: 50, lossLimitUsd: 999, durationSec: 99_999, throttleMs: 0 });
  check("rails clamp to hard ceilings", c.clipUsd === RAIL_LIMITS.clipUsdMax && c.lossLimitUsd === RAIL_LIMITS.lossLimitMax && c.durationSec === RAIL_LIMITS.durationMax && c.throttleMs >= 800);
}
process.exit(failed ? 1 : 0);
