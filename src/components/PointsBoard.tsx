"use client";

/**
 * PointsBoard · THE CHAMPIONSHIP.
 *
 * Points existed, were computed honestly, and were invisible. They sat in the
 * Race Card as one number with no explanation and no pull, so nobody had a
 * reason to compete for them, come back for them, or care that they are the
 * permanent record of what a rider actually farmed.
 *
 * This is the propagation surface: what points ARE, how they are earned in the
 * rider's own numbers, where they stand right now against everyone else, and
 * the honest position on what a season means. It is a headline section on the
 * paddock, not a rules page nobody opens.
 *
 * Honesty rule for this file: nothing here promises a token or a payout. Points
 * are standing and a record. Venue airdrops belong to the venues. Say exactly
 * that, because a farming audience can smell a wink.
 */
import { useEffect, useState } from "react";
import Icon from "./brand/Icon";
import { career, PRACTICE_CAP } from "@/lib/game/rideLog";
import { fetchTop } from "@/lib/game/backend";
import { myCode } from "@/lib/game/referral";
import { RiderName } from "./RiderAvatar";

type Row = { rider: string; points: number; realVolume: number; rides: number };

export default function PointsBoard({
  onStandings,
  onPlay,
}: {
  onStandings: () => void;
  onPlay: () => void;
}) {
  const [top, setTop] = useState<Row[]>([]);
  // three states, never one sentence for all of them · reading, the board would not answer, read
  const [board, setBoard] = useState<"reading" | "failed" | "read">("reading");
  const [mine, setMine] = useState(0);
  useEffect(() => {
    // Season 1 is the whole record so far · all time, not the query's 24h default
    fetchTop(25, 0)
      .then((t) => {
        setTop(t as Row[]);
        setBoard("read");
      })
      .catch(() => setBoard("failed"));
    setMine(career().points);
  }, []);

  const me = myCode();
  const myIndex = top.findIndex((r) => r.rider === me);
  const leader = top[0];
  // the gap that turns a number into a race
  const ahead = myIndex > 0 ? top[myIndex - 1] : myIndex === -1 ? top[top.length - 1] : null;
  const gap = ahead ? Math.max(0, ahead.points - mine) : 0;

  return (
    <section className="mt-9 w-full">
      <div className="checker h-[5px] w-full opacity-25" />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-[19px] font-black uppercase text-bone min-[900px]:text-[24px]">
            The championship
          </h2>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-snug text-flat">
            Every ride earns <b className="text-bone">Hyperider points</b> on top of whatever the
            venue&apos;s own airdrop pays you. One drive, two ledgers, and the points are the part
            that is yours across every road you ride.
          </p>
        </div>
        <button
          onClick={onStandings}
          className="gp-btn display shrink-0 border-2 border-steel px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-bone hover:border-papaya hover:text-papaya"
        >
          See the standings →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 border-2 border-steel min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* how points are earned, in the real numbers */}
        <div className="gp-lit border-b-2 border-dashed border-hairline p-4 min-[900px]:border-b-0 min-[900px]:border-r-2 min-[900px]:p-5">
          <div className="display text-[10.5px] font-black uppercase tracking-[0.14em] text-papaya">
            How you earn
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 min-[620px]:grid-cols-2">
            {(
              [
                ["1 point", "per $1 of REAL volume farmed", "text-chart"],
                [`capped ${PRACTICE_CAP}`, "per practice ride, so free play can never top the board", "text-flat"],
                ["up to +50%", "skill multiplier from dodges and streaks", "text-amber"],
                ["+10% each", "per convoy mate riding live with you, up to +50%", "text-sky"],
              ] as const
            ).map(([big, small, tone]) => (
              <div key={big} className="border border-steel bg-ink px-3 py-2.5">
                <div className={`display text-[16px] font-black ${tone}`}>{big}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-flat">{small}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-flat">
            Real volume dominates on purpose. Practice is a taste that teaches you the game, never a
            farm, so the board reflects riders who actually put volume through a venue.{" "}
            <b className="text-bone">
              Points are standing and a permanent record of what you farmed. Nothing is promised
              beyond that, and any venue airdrop is the venue&apos;s to pay.
            </b>
          </p>
        </div>

        {/* where the rider stands, right now */}
        <div className="p-4 min-[900px]:p-5">
          <div className="display text-[10.5px] font-black uppercase tracking-[0.14em] text-flat">
            Season 1 · where you stand
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div>
              <div className="display gp-tick text-[30px] font-black leading-none text-amber">
                {mine.toLocaleString()}
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.12em] text-flat">
                your points
              </div>
            </div>
            {myIndex >= 0 && (
              <div className="ml-auto text-right">
                <div className="display text-[22px] font-black leading-none text-bone">
                  P{myIndex + 1}
                </div>
                <div className="mt-1 text-[10.5px] uppercase tracking-[0.12em] text-flat">
                  on the board
                </div>
              </div>
            )}
          </div>

          {top.length > 0 ? (
            <>
              <div className="mt-3 border-t border-hairline pt-3">
                {top.slice(0, 3).map((r, i) => (
                  <div
                    key={r.rider}
                    className={`flex items-baseline justify-between py-1 text-[12px] tabular-nums ${
                      r.rider === me ? "text-chart" : "text-bone"
                    }`}
                  >
                    <span className="display flex min-w-0 items-center gap-1.5 text-[11px] font-bold">
                      P{i + 1} <RiderName code={r.rider} you={r.rider === me} className="text-[11px]" />
                      {r.rider === me ? " (you)" : ""}
                    </span>
                    <span className="text-flat">{r.points.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {gap > 0 && ahead && (
                <div className="mt-3 border-2 border-papaya bg-papaya/5 px-3 py-2.5 text-[12px] leading-snug text-bone">
                  {/* the chase · you, the rider ahead, and the gap between as a track */}
                  <div className="relative h-[14px] w-full" role="img" aria-label={`${mine.toLocaleString()} of ${ahead.points.toLocaleString()} points`}>
                    <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 bg-steel/70" />
                    <div className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 bg-amber" style={{ width: `${Math.min(100, (mine / Math.max(1, ahead.points)) * 100)}%` }} />
                    <span className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-amber" style={{ left: `${Math.min(100, (mine / Math.max(1, ahead.points)) * 100)}%` }} />
                    <span className="flag absolute right-0 top-0 h-[14px] w-4" aria-hidden />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] tabular-nums text-flat">
                    <span>you {mine.toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1">
                      <RiderName code={ahead.rider} className="text-[10px]" /> {ahead.points.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    {myIndex === -1 ? (
                      <>
                        {/* off the board · the gap is to its last place, the line to cross */}
                        <b className="text-papaya">{gap.toLocaleString()} points</b> puts you on the board, roughly{" "}
                        <b>${Math.round(gap).toLocaleString()}</b> of farmed volume.
                        {leader && (
                          <>
                            {" "}
                            <RiderName code={leader.rider} className="inline-flex text-[12px]" /> leads Season 1 with{" "}
                            <b className="text-papaya">{leader.points.toLocaleString()}</b>.
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <b className="text-papaya">{gap.toLocaleString()} points</b> is all that separates
                        you from <RiderName code={ahead.rider} className="inline-flex text-[12px]" />. That is roughly{" "}
                        <b>${Math.round(gap).toLocaleString()}</b> of farmed volume.
                      </>
                    )}
                  </div>
                </div>
              )}
              {myIndex === -1 && leader && !(gap > 0 && ahead) && (
                <div className="mt-3 border-2 border-papaya bg-papaya/5 px-3 py-2.5 text-[12px] leading-snug text-bone">
                  You are not on the board yet. <RiderName code={leader.rider} className="inline-flex text-[12px]" /> leads Season 1 with{" "}
                  <b className="text-papaya">{leader.points.toLocaleString()}</b>. One real ride puts
                  your name up there.
                </div>
              )}
            </>
          ) : (
            <div className="mt-3 text-[12px] leading-snug text-flat">
              {board === "reading"
                ? "Reading the live board…"
                : board === "failed"
                  ? "The live board didn't answer just now — your points are safe; it refreshes when you come back."
                  : "Nobody has ridden this season yet — the first real ride takes P1."}{" "}
              Every ride you take is submitted under your rider name, never your wallet.
            </div>
          )}

          <button
            onClick={onPlay}
            className="gp-btn gp-btn-primary display mt-3 w-full bg-papaya py-3 text-[11.5px] font-black uppercase tracking-wide text-ink"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Icon name="trophy" size={15} /> Earn points now
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
