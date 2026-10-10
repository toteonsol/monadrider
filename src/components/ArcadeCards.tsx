"use client";

import { useEffect, useState } from "react";
import Icon from "./brand/Icon";
import { PER1M_GOOD, PER1M_OK } from "./viz/Viz";
import { todaysBounties, readStreak, setComplete, todaysBonus } from "@/lib/game/bounties";

/**
 * Arcade cards · Livery v2 landing pieces (blueprint Screen 01).
 *
 * SpecSheet, the COST/$1M plate: our measured cost vs the competition, shown
 * like a car's spec plate. Numbers are REAL session measurements (0.35–0.60bps
 * on RH Lighter BTC Turbo; comparison rows are typical published market rates)
 *, update them only from new measurements, never invent.
 *
 * Cartridges, the games rail: one engine, every cartridge farms. Ride is live;
 * Surfer/Pulse/Depot are in the shop (each ships 3D at-or-above the current
 * ThreeRide bar, that's the fidelity floor, not a hope).
 */

/* THE GRID · four cartridges, each wearing a REAL frame captured from its own
   3D world (public/game/*.jpg). Nobody should have to guess that this is a
   game, the starting grid shows the games themselves. */
const CARTS = [
  {
    key: "ride",
    no: "01",
    title: "Ride",
    desc: "the 3D night drive · lanes are longs & shorts",
    tag: "● LIVE",
    live: true,
    accent: "var(--lav)",
    shot: "/game/ride3d.jpg",
  },
  {
    key: "surfer",
    no: "02",
    title: "Surfer",
    desc: "carve the LIVE price swell · lip = long, trough = short",
    tag: "● LIVE",
    live: true,
    accent: "#4DC3FF",
    shot: "/game/surf3d.jpg",
  },
  {
    key: "pulse",
    no: "03",
    title: "Pulse",
    desc: "rhythm tunnel · the tempo IS the tape",
    tag: "● LIVE",
    live: true,
    accent: "var(--papaya)",
    shot: "/game/pulse3d.jpg",
  },
  {
    key: "depot",
    no: "04",
    title: "Depot",
    desc: "your yard, alive · every crate = real volume",
    tag: "● LIVE",
    live: true,
    accent: "var(--chart)",
    shot: "/game/depot3d.jpg",
  },
] as const;

export function Cartridges({
  onPlayRide,
  onPlaySurf,
  onPlayPulse,
  onPlayDepot,
  onPlayCity,
  cue = false,
}: {
  /** a ride just went live · the grid lights up and RIDE says "start here" */
  cue?: boolean;
  onPlayRide: () => void;
  onPlaySurf: () => void;
  onPlayPulse: () => void;
  onPlayDepot: () => void;
  /** Now City · the open-world preview, a door of its own under the grid */
  onPlayCity?: () => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="display text-[19px] font-black uppercase text-bone min-[900px]:text-[22px]">The grid</div>
        <div className={`text-[12px] ${cue ? "font-bold text-papaya" : "text-flat"}`}>
          {cue ? "you're LIVE · pick one, your ride trades while you play" : "four cartridges · one engine · practice free, no wallet"}
        </div>
        <div className="ml-auto text-[11px] font-bold text-chart">all four PLAYABLE</div>
      </div>
      <div className={`grid grid-cols-2 border-2 min-[900px]:grid-cols-4 ${cue ? "border-papaya motion-safe:animate-[rtn-beacon_1.6s_ease-in-out_infinite]" : "border-steel"}`}>
        {CARTS.map((c, i) => (
          <button
            key={c.key}
            onClick={
              c.key === "surfer"
                ? onPlaySurf
                : c.key === "pulse"
                  ? onPlayPulse
                  : c.key === "depot"
                    ? onPlayDepot
                    : onPlayRide
            }
            className={`group relative min-h-[150px] overflow-hidden text-left transition min-[900px]:min-h-[200px] ${
              i % 2 === 0 ? "border-r-2 border-dashed border-hairline" : ""
            } ${i < 2 ? "border-b-2 border-dashed border-hairline min-[900px]:border-b-0" : ""} ${
              i === 2 ? "min-[900px]:border-r-2 min-[900px]:border-dashed min-[900px]:border-hairline" : ""
            } ${i === 1 ? "min-[900px]:border-r-2 min-[900px]:border-dashed min-[900px]:border-hairline" : ""}`}
            title="play now · free practice, no wallet"
          >
            {/* the real 3D frame from this cartridge's own world */}
            <span
              aria-hidden
              className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.06]"
              style={{ backgroundImage: `url(${c.shot})` }}
            />
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(17,16,19,.5), rgba(17,16,19,.05) 42%, rgba(17,16,19,.9))",
              }}
            />
            <span aria-hidden className="gp-scan" style={{ animationDelay: `${i * 0.8}s` }} />
            <span aria-hidden className="display absolute left-3.5 top-3 text-[26px] font-black leading-none text-bone/35 min-[900px]:text-[32px]">
              {c.no}
            </span>
            {cue && i === 0 ? (
              <span className="display absolute right-3 top-3 bg-papaya px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.08em] text-ink">start here</span>
            ) : (
              <span
                className="absolute right-3 top-3.5 text-[9.5px] font-extrabold uppercase tracking-[0.14em]"
                style={{ color: "var(--chart)" }}
              >
                {c.tag}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-3.5 pb-3">
              <span className="display text-[15px] font-bold uppercase leading-tight tracking-wide text-bone min-[900px]:text-[18px]">
                {c.title}
              </span>
              <span className="text-[10px] leading-tight text-bone/70 min-[900px]:text-[11.5px]">{c.desc}</span>
            </span>
          </button>
        ))}
      </div>
      {onPlayCity && (
        <button
          onClick={onPlayCity}
          className="group relative mt-2 flex w-full flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden border-2 border-steel bg-ink-soft px-4 py-3 text-left transition hover:border-lav"
          title="Now City · the open-world preview · render-only"
        >
          <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35 transition duration-500 group-hover:opacity-50" style={{ backgroundImage: "url(/game/city3d.jpg)" }} />
          <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(17,16,19,.96) 30%, rgba(17,16,19,.55))" }} />
          <span aria-hidden className="display relative text-[22px] font-black leading-none text-bone/35">05</span>
          <span className="relative flex min-w-[200px] flex-1 flex-col">
            <span className="display text-[14px] font-bold uppercase tracking-wide text-bone">
              Now City <span className="text-lav">· open-world preview</span>
            </span>
            <span className="text-[11px] leading-tight text-bone/70">
              drive somewhere · every job has an address, every district is a venue, every car on the road is a real fill · render-only for now
            </span>
          </span>
          <span className="display relative w-full bg-lav px-3 py-2 text-center text-[10px] font-black uppercase tracking-wide text-ink sm:w-auto sm:py-1.5">▶ look around</span>
        </button>
      )}
    </div>
  );
}

/** THE DAILY SET · three bounties, same for every rider, reset at midnight.
 *  The come-back-tomorrow engine: an unfinished set expires; a finished one
 *  asks you to defend the streak. Progress accrues from ANY cartridge. */
export function DailySet() {
  const [set, setSet] = useState<ReturnType<typeof todaysBounties>>([]);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const read = () => {
      setSet(todaysBounties());
      setStreak(readStreak().n);
    };
    read();
    const t = setInterval(read, 8000); // live-ish · bounty progress lands between runs
    return () => clearInterval(t);
  }, []);
  if (set.length === 0) return null;
  const done = setComplete();
  return (
    <div className="mt-5 rounded-2xl border border-hairline bg-ink/70 p-4 backdrop-blur-md">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-papaya min-[900px]:text-[12px]">
          <Icon name="spark" size={14} /> today&apos;s set · resets at midnight
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-amber">
          <SetChain streak={streak} done={done} />
          <span>
            {done
              ? `set complete · +${todaysBonus().toLocaleString()} pts banked, defend it tomorrow`
              : streak > 0
                ? `${streak}-day set streak on the line · finish all 3 for +${Math.min(1500, 500 + 100 * streak).toLocaleString()} pts`
                : "finish all 3 → +500 pts · streaks pay more"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-3">
        {set.map((b) => (
          <div
            key={b.kind}
            className={`rounded-xl border px-3.5 py-2.5 ${
              b.done ? "border-chart/50 bg-chart/10" : "border-hairline bg-ink-soft/70"
            }`}
          >
            <div className={`text-[13px] font-extrabold ${b.done ? "text-chart" : "text-bone"}`}>
              {b.done ? "✓ " : ""}
              {b.label}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline/60">
              <div
                className={`h-full rounded-full ${b.done ? "bg-chart" : "bg-gradient-to-r from-papaya to-papaya-hot"}`}
                style={{ width: `${Math.min(100, (b.progress / b.target) * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[10.5px] tabular-nums text-flat">
              {b.done ? "done" : `${Math.floor(b.progress)} / ${b.target}`}
              {b.world !== "any" && (
                <span className="text-flat-dim">
                  {" "}· {b.world === "ride" ? "Ride" : b.world === "surf" ? "Surfer" : "Pulse"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* THE STREAK CHAIN · one link per day the set was finished, and today's link
   open (dashed) until all three are done. The bonus grows +100 a day to its
   +1,500 cap on day ten, so the chain is drawn ten links long at most. */
function SetChain({ streak, done }: { streak: number; done: boolean }) {
  const lit = Math.min(done ? 10 : 9, Math.max(0, streak));
  const cells = lit + (done ? 0 : 1);
  return (
    <span
      className="relative inline-flex shrink-0 items-center gap-[3px]"
      role="img"
      aria-label={`${streak}-day set streak · today's set ${done ? "done" : "still open"}`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber/35" aria-hidden />
      {Array.from({ length: cells }, (_, i) => {
        const today = i === cells - 1;
        return (
          <span
            key={i}
            className={`relative h-[9px] w-[9px] ${
              i < lit ? (today && done ? "bg-amber ring-1 ring-papaya ring-offset-1 ring-offset-ink" : "bg-amber") : "border border-dashed border-amber bg-ink"
            }`}
          />
        );
      })}
    </span>
  );
}

/** NEW THIS WEEK · the discovery strip. Every fresh feature, where it LIVES,
 *  one tap to reach it, the fix for "features exist but nobody can find them". */
export function WhatsNew({
  onHub,
  onCampaigns,
}: {
  onHub: () => void;
  onCampaigns: () => void;
}) {
  const card =
    "flex min-h-[64px] flex-col justify-center rounded-xl border border-hairline bg-ink-soft/70 px-3.5 py-2.5 text-left backdrop-blur-sm transition";
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-papaya min-[900px]:text-[12px]">
        where to find everything
      </div>
      <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[900px]:grid-cols-4">
        <button onClick={onHub} className={`${card} hover:border-papaya active:scale-[0.99]`}>
          <span className="flex items-center gap-2 text-[13px] font-extrabold text-bone">
            <Icon name="convoy" size={16} className="text-papaya" /> Convoy · ride together
          </span>
          <span className="text-[11.5px] leading-snug text-flat">
            +10% points per mate riding, to +50% · <b className="text-papaya">tap → open the Hub</b>
          </span>
        </button>
        <button onClick={onCampaigns} className={`${card} hover:border-papaya active:scale-[0.99]`}>
          <span className="flex items-center gap-2 text-[13px] font-extrabold text-bone">
            <Icon name="airdrop" size={16} className="text-papaya" /> Campaigns board
          </span>
          <span className="text-[11.5px] leading-snug text-flat">
            LIT · Hotstuff · Ondo · Perpl, one board · <b className="text-papaya">tap → open it</b>
          </span>
        </button>
        <div className={card}>
          <span className="flex items-center gap-2 text-[13px] font-extrabold text-bone">
            <Icon name="allroads" size={16} className="text-papaya" /> All Roads · every venue
          </span>
          <span className="text-[11.5px] leading-snug text-flat">
            the pill beside CRUISE / TURBO once <b className="text-bone">2+ venues are geared up</b>
          </span>
        </div>
        <div className={card}>
          <span className="flex items-center gap-2 text-[13px] font-extrabold text-bone">
            <Icon name="doctor" size={16} className="text-papaya" /> Connection doctor
          </span>
          <span className="text-[11.5px] leading-snug text-flat">
            wallet stuck? the pulse icon at the end of the wallet row resets it · keys survive
          </span>
        </div>
      </div>
    </div>
  );
}

/** The honest plate: cost per $1M of volume, measured, our headline stat ·
 *  three ranges drawn on ONE $/1M axis (the app's cost scale under it), our
 *  band carried down every row, so the gap is the picture. */
const SPEC_AXIS = 600; // $ per $1M at the right edge · "$500+" runs off it
export function SpecSheet({ wide = false }: { wide?: boolean }) {
  const rows: { k: string; v: string; lo: number; hi: number | null; tone: string; us?: boolean }[] = [
    { k: "Hyperider · Robinhood Lighter", v: "$35–60", lo: 35, hi: 60, tone: "text-chart", us: true },
    { k: "typical volume-bot service", v: "$250–400", lo: 250, hi: 400, tone: "text-blood" },
    { k: "a typical venue charging 0.05% a trade", v: "$500+", lo: 500, hi: null, tone: "text-blood" },
  ];
  const x = (v: number) => (Math.min(v, SPEC_AXIS) / SPEC_AXIS) * 100;
  const ours = rows[0];
  return (
    <div className={`mx-auto mt-4 w-full rounded-2xl border border-hairline bg-ink/75 px-4 py-3 backdrop-blur-md ${wide ? "max-w-none px-5" : "max-w-[560px] min-[900px]:max-w-[640px]"}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-flat">
          the spec sheet · cost per $1M volume
        </span>
        {/* these are fixed figures from real sessions, so the badge says so · the live numbers are in the cockpit */}
        <span className="rounded-full border border-papaya/40 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-papaya">
          from real sessions
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.k} className="border-t border-hairline/50 py-1.5 first:border-t-0">
          <div className="flex items-center justify-between gap-3 text-[12.5px] min-[900px]:text-[13.5px]">
            <span className="flex min-w-0 items-center gap-1.5 text-bone">
              {r.us && <Icon name="flag" size={14} className="text-papaya" />}
              {r.k}
            </span>
            <b className={`font-telemetry shrink-0 ${r.tone}`}>{r.v}</b>
          </div>
          {/* this row's range on the shared axis · our band shaded on every row */}
          <div className="relative mt-1 h-[8px] bg-steel/30" aria-hidden>
            <span className="absolute inset-y-0 bg-papaya/15" style={{ left: `${x(ours.lo)}%`, width: `${x(ours.hi ?? ours.lo) - x(ours.lo)}%` }} />
            {r.hi != null ? (
              <span
                className={`absolute inset-y-0 ${r.us ? "bg-chart shadow-[0_0_8px_var(--chart)]" : "bg-blood/70"}`}
                style={{ left: `${x(r.lo)}%`, width: `${Math.max(1, x(r.hi) - x(r.lo))}%` }}
              />
            ) : (
              // open-ended · it keeps going past the edge of the axis
              <span className="absolute inset-y-0 right-0 bg-gradient-to-r from-blood/70 to-blood/15" style={{ left: `${x(r.lo)}%` }} />
            )}
          </div>
        </div>
      ))}
      {/* the axis is the app's one cost scale (Viz's PER1M bands), so this plate
          and every Per1M meter colour the same number the same way */}
      <div className="mt-1" aria-hidden>
        <div className="flex h-[3px] w-full">
          <span className="h-full bg-chart/60" style={{ width: `${x(PER1M_GOOD)}%` }} />
          <span className="h-full bg-amber/60" style={{ width: `${x(PER1M_OK) - x(PER1M_GOOD)}%` }} />
          <span className="h-full flex-1 bg-blood/50" />
        </div>
        <div className="relative mt-0.5 h-[12px] text-[9px] tabular-nums text-flat-dim">
          {[0, PER1M_GOOD, PER1M_OK, 500].map((v) => (
            <span key={v} className={`absolute top-0 ${v === 0 ? "" : "-translate-x-1/2"}`} style={{ left: `${x(v)}%` }}>
              ${v}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1 text-[10px] leading-snug text-flat">
        real sessions, not claims · every number re-measured as we tune · receipts in{" "}
        <span className="text-bone">Research</span>
      </div>
    </div>
  );
}
