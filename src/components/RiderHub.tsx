"use client";
/**
 * Rider hub · the in-ride profile panel, Monad edition: your career from the
 * ride log, the Paddock's top riders this season, and where your live rides
 * stand onchain. Opens over any world without ending the ride.
 */
import { useEffect, useState } from "react";
import { totals, listRides, ridesInWindow } from "@/lib/game/rideLog";
import { fetchTop, fetchStreak, type TopRider } from "@/lib/game/backend";
import { myCode } from "@/lib/game/referral";
import { riderAlias } from "@/lib/game/riderName";

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: n !== 0 && Math.abs(n) < 10 ? 2 : 0 })}`;

export default function RiderHub({ onClose }: { onClose: () => void }) {
  const [top, setTop] = useState<TopRider[]>([]);
  const [streak, setStreak] = useState(0);
  const all = listRides();
  const life = totals(all);
  const week = totals(ridesInWindow("7d", all));
  const me = myCode();

  useEffect(() => {
    void fetchTop(8, 30 * 86_400_000).then(setTop);
    void fetchStreak().then(setStreak);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[86dvh] w-full overflow-y-auto border-2 border-steel bg-ink-soft px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Rider hub"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-telemetry text-[10px] uppercase tracking-[0.2em] text-flat">rider · {me}</div>
            <div className="display text-2xl font-black uppercase text-bone">{riderAlias(me).name}</div>
          </div>
          <button onClick={onClose} className="border border-hairline px-3 py-1.5 text-[12px] font-bold text-flat hover:text-bone">
            ✕ close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat k="points" v={life.points.toLocaleString()} />
          <Stat k="streak" v={`${streak}d`} />
          <Stat k="rides" v={`${life.rides}`} sub={`${life.liveRides} live`} />
          <Stat k="real volume" v={usd(life.realVolume)} />
          <Stat k="real net" v={usd(life.realNet)} tone={life.realNet >= 0 ? "text-chart" : "text-blood"} />
          <Stat k="this week" v={usd(week.realVolume)} sub={`${week.rides} rides`} />
        </div>

        <div className="mt-5">
          <div className="font-telemetry text-[10px] uppercase tracking-[0.2em] text-flat">the paddock · last 30 days</div>
          {top.length === 0 && <p className="mt-2 text-[13px] text-flat">No riders on the board yet. Yours could be the first name.</p>}
          <ol className="mt-2 divide-y divide-hairline">
            {top.map((t, i) => (
              <li key={t.rider} className={`flex items-center justify-between py-2 ${t.rider === me ? "text-papaya" : "text-bone"}`}>
                <span className="flex items-center gap-3">
                  <span className="font-telemetry w-5 text-flat">{i + 1}</span>
                  <span className="font-bold">{riderAlias(t.rider).name}</span>
                  {t.realVolume > 0 && <span className="font-telemetry text-[10px] text-chart">live {usd(t.realVolume)}</span>}
                </span>
                <span className="font-telemetry">{t.points.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-flat">
          Live rides count only after the game server checks their Perpl orders on Monad: each named tx must be a successful call
          from your wallet to Perpl&apos;s Exchange. Practice rides are capped at 150 points.
        </p>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="border border-hairline bg-ink px-3 py-2">
      <div className="font-telemetry text-[9px] uppercase tracking-[0.18em] text-flat">{k}</div>
      <div className={`font-telemetry text-[15px] font-bold ${tone ?? "text-bone"}`}>{v}</div>
      {sub && <div className="text-[10px] text-flat">{sub}</div>}
    </div>
  );
}
