"use client";

/**
 * 🏁 THE PADDOCK RIGHT NOW · who is on the road, what they just did, who is
 * leading today — the social pulse of the app, on the page people land on.
 *
 * The data was always there (every ride is submitted to the board) and was
 * shown as a 9px list of anonymous codes wedged between two buttons. A place
 * feels alive when you can see other people in it: this is that, with a name
 * and a face for every rider (derived from their code — nobody's wallet,
 * nobody's choice to impersonate) and a feed that moves.
 *
 * Honest by construction: every row is a real submitted ride; practice laps
 * say "practice"; money only appears where real volume was traded.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fetchFieldSummary, fetchRecentRides, fetchTop, type RecentRide, type TopRider } from "@/lib/game/backend";
import { myCode } from "@/lib/game/referral";
import { VENUES, type VenueId } from "@/lib/game/venues";
import VenueMark from "./brand/VenueMark";
import RiderAvatar, { RiderName } from "./RiderAvatar";
import AnimatedNumber from "./AnimatedNumber";
import { timeAgo, tx, useT } from "@/lib/i18n";
import Rich from "@/lib/i18n/Rich";

const GAME: Record<string, string> = { "3d": "Ride", car: "Ride", bike: "Ride", surf: "Surfer", pulse: "Pulse", bonus: tx("a bonus run") };
const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const isVenue = (v: string | null): v is VenueId => !!v && v in VENUES;

/* THE SHORTEST WINDOW WORTH READING. Alpha traffic is thin — a strict
   "last 24 hours" greeted visitors with "Quiet on the road" most days, which
   reads as a dead app. So the paddock shows the shortest window that holds
   enough riding to mean something, and says which window it is. Never
   padded, never invented: an honest week beats a fake today. */
const WINDOWS = [
  { ms: 24 * 3600_000, label: tx("today") },
  { ms: 7 * 24 * 3600_000, label: tx("this week") },
  { ms: 30 * 24 * 3600_000, label: tx("this month") },
  { ms: 90 * 24 * 3600_000, label: tx("the last 3 months") },
] as const;
const ENOUGH = 5;

export default function PaddockNow({ onStandings, onPlay }: { onStandings: () => void; onPlay: () => void }) {
  const reduce = useReducedMotion();
  const t = useT();
  const [rides, setRides] = useState<RecentRide[] | null>(null);
  const [top, setTop] = useState<TopRider[] | null>(null);
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[0]);
  /* `rides` and `liveRiders` only draw the live-vs-practice splits · null
     where this deployment's counts do not carry them */
  const [day, setDay] = useState<{ riders: number; live: number; vol: number; rides: number | null; liveRiders: number | null }>({
    riders: 0,
    live: 0,
    vol: 0,
    rides: null,
    liveRiders: null,
  });
  const [, setTick] = useState(0);
  const me = myCode();

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      /* the field's counts per window come from the server, exact however
         busy it gets · they were summed here from the newest 60 rides, so a
         busy day undercounted. The feed is still the newest rides. */
      const [field, all] = await Promise.all([fetchFieldSummary(), fetchRecentRides(WINDOWS[WINDOWS.length - 1].ms)]);
      if (dead) return;
      const now = Date.now();
      const counted = (w: (typeof WINDOWS)[number]) => field.find((f) => f.ms === w.ms)?.summary ?? null;
      const inside = (w: (typeof WINDOWS)[number]) => all.filter((r) => now - r.ts <= w.ms);
      // the shortest window that holds enough riding to mean something
      const pick =
        WINDOWS.find((w) => {
          const c = counted(w);
          return c ? c.rides >= ENOUGH : inside(w).length >= ENOUGH;
        }) ?? WINDOWS[WINDOWS.length - 1];
      const list = inside(pick);
      const c = counted(pick);
      setWin(pick);
      const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
      setDay(
        c
          ? { riders: c.riders, live: c.liveRides, vol: c.realVolume, rides: num(c.rides), liveRiders: num(c.liveRiders) }
          : {
              riders: new Set(list.map((r) => r.rider)).size,
              live: list.filter((r) => r.live).length,
              vol: list.reduce((sum, r) => sum + (r.live ? r.realVolume : 0), 0),
              rides: list.length,
              liveRiders: new Set(list.filter((r) => r.live).map((r) => r.rider)).size,
            },
      );
      setRides(list);
      void fetchTop(5, pick.ms)
        .then((t) => !dead && setTop(t))
        .catch(() => !dead && setTop([]));
    };
    void pull();
    const t = setInterval(() => document.visibilityState === "visible" && void pull(), 60_000);
    // "3m ago" stays true between pulls
    const clock = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => {
      dead = true;
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);

  const feed = (rides ?? []).slice(0, 7);
  // one scale for every tick in the feed · the biggest live ride fills it
  const feedTop = Math.max(1, ...feed.map((r) => (r.live ? r.realVolume : 0)));
  const leadPts = Math.max(1, ...(top ?? []).slice(0, 5).map((r) => r.points));

  return (
    <section className="mt-9 w-full" aria-labelledby="paddock-now">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="paddock-now" className="display flex items-center gap-2 text-[19px] font-black uppercase text-bone min-[900px]:text-[22px]">
            <span className="relative flex h-2.5 w-2.5">
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart opacity-60" />}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-chart" />
            </span>
            {t("The paddock right now")}
          </h2>
          <p className="mt-1 text-[12.5px] text-flat">
            <Rich text={t("every ride **{window}**, newest first · names are drawn from rider codes, never wallets", { window: t(win.label) })} />
          </p>
        </div>
        <button onClick={onStandings} className="display text-[11.5px] font-bold uppercase tracking-wide text-papaya hover:underline">
          {t("full standings")} →
        </button>
      </div>

      {/* the day in three numbers · steel rules show through the gaps. Where
          the field's counts carry both halves, a split under the number says
          how much of it was real: green is live, gray is practice */}
      <div className="mt-3 grid grid-cols-3 gap-[2px] border-2 border-steel bg-steel">
        {(
          [
            [
              t("riders"),
              rides ? <AnimatedNumber value={day.riders} format={(v) => String(Math.round(v))} /> : null,
              rides && day.liveRiders != null && day.riders > 0
                ? { live: Math.min(day.liveRiders, day.riders), total: day.riders, note: t("{n} live", { n: Math.min(day.liveRiders, day.riders) }) }
                : null,
            ],
            [
              t("live rides"),
              rides ? <AnimatedNumber value={day.live} format={(v) => String(Math.round(v))} /> : null,
              rides && day.rides != null && day.rides > 0
                ? { live: Math.min(day.live, day.rides), total: day.rides, note: `${Math.max(0, day.rides - day.live).toLocaleString()} ${t("practice")}` }
                : null,
            ],
            [t("real volume"), rides ? <AnimatedNumber value={day.vol} format={money} /> : null, null],
          ] as const
        ).map(([k, v, split]) => (
          <div key={k} className="bg-ink px-3 py-3 text-center">
            <div className="display text-[10.5px] font-bold uppercase tracking-[0.14em] text-flat">{k}</div>
            {v == null ? <div className="skel mx-auto mt-1.5 h-[24px] w-14" /> : <div className="display gp-tick mt-1 text-[22px] font-black tabular-nums text-bone">{v}</div>}
            {split && (
              <>
                <div className="mx-auto mt-1.5 flex h-[5px] w-full max-w-[110px] gap-px bg-ink" aria-hidden>
                  {split.live > 0 && <span className="h-full bg-chart/80" style={{ flexGrow: split.live, flexBasis: 0 }} />}
                  {split.total - split.live > 0 && <span className="h-full bg-flat/40" style={{ flexGrow: split.total - split.live, flexBasis: 0 }} />}
                </div>
                <div className="mt-1 text-[10px] tabular-nums text-flat-dim">{split.note}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-[1.4fr_1fr]">
        {/* ── the feed ── */}
        <div className="border-2 border-steel bg-ink-soft/50">
          <div className="display border-b-2 border-steel px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-flat">{t("latest on the road")}</div>
          {rides == null ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skel h-[44px]" />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="display text-[14px] font-black uppercase text-bone">{t("Quiet on the road")}</div>
              <p className="mx-auto mt-1 max-w-[36ch] text-[12px] text-flat">{t("Nobody has ridden lately. Take the first lap and you're at the top of this list.")}</p>
              <button onClick={onPlay} className="gp-btn gp-btn-primary display mt-3 border-2 border-papaya bg-papaya px-4 py-2 text-[12px] font-black uppercase text-ink">
                {t("take a free lap")}
              </button>
            </div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {feed.map((r) => (
                  <motion.li
                    key={`${r.rider}|${r.ts}`}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-3 border-t-2 border-steel/50 px-3.5 py-2.5 first:border-t-0"
                  >
                    <RiderAvatar code={r.rider} size={32} you={r.rider === me} />
                    <div className="min-w-0 flex-1">
                      <RiderName code={r.rider} you={r.rider === me} className="text-[13px]" link />
                      <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-flat">
                        <span className="shrink-0">{t(r.live ? "drove {game}" : "practised {game}", { game: t(GAME[r.mode] ?? "a lap") })}</span>
                        {isVenue(r.venue) && r.live && (
                          <span className="flex min-w-0 items-center gap-1">
                            {t("on")} <VenueMark venue={r.venue} size={12} className="shrink-0" />
                            <span className="truncate text-bone">{VENUES[r.venue].label}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className={`text-[12.5px] font-bold ${r.live ? "text-chart" : "text-flat"}`}>{r.live ? money(r.realVolume) : t("practice")}</div>
                      {/* the ride's volume against the biggest in the feed · practice moves none */}
                      <div className="ml-auto mt-0.5 flex h-[4px] w-14 justify-end bg-steel/40" aria-hidden>
                        {r.live && r.realVolume > 0 && <span className="h-full bg-chart/70" style={{ width: `${Math.max(4, (r.realVolume / feedTop) * 100)}%` }} />}
                      </div>
                      <div className="text-[11px] text-flat">
                        +{Math.round(r.points).toLocaleString()} {t("pts")} · {timeAgo(r.ts)}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* ── today's leaders ── */}
        <div className="border-2 border-steel bg-ink-soft/50">
          <div className="display border-b-2 border-steel px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-flat">{t("leading {window}", { window: t(win.label) })}</div>
          {top == null ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel h-[44px]" />
              ))}
            </div>
          ) : top.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-flat">{t("No points on the board {window} yet · the first ride takes the lead.", { window: t(win.label) })}</div>
          ) : (
            <ol>
              {top.slice(0, 5).map((row, i) => (
                <li key={row.rider} className={`flex items-center gap-3 border-t-2 border-steel/50 px-3.5 py-2.5 first:border-t-0 ${row.rider === me ? "bg-papaya/5" : ""}`}>
                  <span className={`display w-5 shrink-0 text-center text-[15px] font-black tabular-nums ${i === 0 ? "text-amber" : i < 3 ? "text-bone" : "text-flat"}`}>{i + 1}</span>
                  <RiderAvatar code={row.rider} size={30} you={row.rider === me} />
                  <div className="min-w-0 flex-1">
                    <RiderName code={row.rider} you={row.rider === me} className="text-[13px]" link />
                    <div className="text-[11px] text-flat">
                      {t("rides: {n}", { n: row.rides })}
                      {row.realVolume > 0 ? ` · ${t("{vol} real", { vol: money(row.realVolume) })}` : ` · ${t("practice")}`}
                    </div>
                    {/* points against the leader · the gap to the top, drawn */}
                    <div className="mt-1 h-[4px] w-full bg-steel/40" aria-hidden>
                      <div className="h-full bg-amber/70" style={{ width: `${Math.max(2, Math.min(100, (row.points / leadPts) * 100))}%` }} />
                    </div>
                  </div>
                  <span className="display shrink-0 text-[14px] font-black tabular-nums text-amber">{Math.round(row.points).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
          <button onClick={onStandings} className="display w-full border-t-2 border-steel py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-flat transition hover:bg-ink-soft hover:text-papaya">
            {t("where do I stand?")} →
          </button>
        </div>
      </div>
    </section>
  );
}
