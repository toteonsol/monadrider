"use client";
/**
 * Pit radio · the bell, the feed and the pop-ups. Opportunity cards carry a
 * "ride this" that switches the market; ride cards carry their Monad tx.
 */
import { useEffect, useState } from "react";
import { useRadio, markRead, type Notice } from "@/lib/radio";
import { TxLink } from "./TxLink";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
};
const toneCls = (n: Notice) => (n.tone === "good" ? "border-chart text-chart" : n.tone === "warn" ? "border-blood text-blood" : "border-papaya text-papaya");
const kindLabel = { opportunity: "on Perpl now", ride: "your ride", tip: "pit tip", wallet: "your wallet" } as const;

export function RadioBell({ onRide }: { onRide: (asset: string) => void }) {
  const { notices, unread } = useRadio();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          markRead();
        }}
        className="display relative flex items-center gap-1.5 border-2 border-steel px-2.5 py-1.5 text-[11px] font-bold uppercase text-bone hover:border-papaya"
        aria-label={`pit radio${unread ? `, ${unread} new` : ""}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        <span className="hidden min-[420px]:inline">radio</span>
        {unread > 0 && <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center bg-papaya px-1 text-[10px] font-black text-ink">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[96] flex justify-end bg-black/50" onClick={() => setOpen(false)}>
          <aside className="h-full w-full max-w-sm overflow-y-auto border-l-2 border-steel bg-ink-soft" onClick={(e) => e.stopPropagation()} aria-label="Pit radio">
            <div className="checker h-[6px] w-full opacity-80" aria-hidden />
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="display text-[16px] font-black uppercase text-bone">Pit radio</div>
                <div className="text-[11.5px] text-flat">live from Perpl on Monad · your rides · tips</div>
              </div>
              <button onClick={() => setOpen(false)} className="display border-2 border-steel px-3 py-1.5 text-[11px] font-bold uppercase text-flat hover:text-bone">
                ✕
              </button>
            </div>
            {notices.length === 0 && <p className="px-4 text-[13px] text-flat">Quiet for now. Market cards arrive within a minute; ride cards when you go live.</p>}
            <ul className="space-y-2 px-4 pb-6">
              {notices.map((n) => (
                <Card
                  key={n.id}
                  n={n}
                  onRide={(a) => {
                    setOpen(false);
                    onRide(a);
                  }}
                />
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}

function Card({ n, onRide }: { n: Notice; onRide?: (asset: string) => void }) {
  return (
    <li className={`border-l-[3px] bg-ink px-3 py-2.5 ${toneCls(n).split(" ")[0]}`}>
      <div className="flex items-center justify-between">
        <span className={`display text-[9.5px] font-black uppercase tracking-[0.14em] ${toneCls(n).split(" ")[1]}`}>{kindLabel[n.kind]}</span>
        <span className="font-telemetry text-[10px] text-flat-dim">{ago(n.at)}</span>
      </div>
      <div className="display mt-0.5 text-[13.5px] font-bold leading-snug text-bone">{n.title}</div>
      <p className="mt-0.5 text-[12px] leading-snug text-flat">{n.body}</p>
      <div className="mt-1.5 flex items-center gap-3">
        {n.kind === "opportunity" && n.asset && onRide && (
          <button onClick={() => onRide(n.asset!)} className="display border-2 border-papaya px-2.5 py-1 text-[10.5px] font-black uppercase text-papaya hover:bg-papaya hover:text-ink">
            ride {n.asset} →
          </button>
        )}
        {n.tx && (
          <span className="text-[11px]">
            <TxLink hash={n.tx} />
          </span>
        )}
      </div>
    </li>
  );
}

/** Pop-ups for fresh notices, over any screen (including a world). */
export function RadioToasts({ onRide, ridesOnly = false }: { onRide: (asset: string) => void; ridesOnly?: boolean }) {
  const [live, setLive] = useState<Notice[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<Notice>).detail;
      if (ridesOnly && n.kind === "opportunity") return; // mid-ride: no market chatter
      setLive((l) => [n, ...l].slice(0, 2));
      setTimeout(() => setLive((l) => l.filter((x) => x.id !== n.id)), 7000);
    };
    window.addEventListener("rtn-radio", on);
    return () => window.removeEventListener("rtn-radio", on);
  }, [ridesOnly]);
  if (!live.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(56px+var(--safe-top))] z-[97] flex flex-col items-center gap-2 px-3">
      {live.map((n) => (
        <div key={n.id} className="pointer-events-auto w-full max-w-md border-2 border-steel bg-ink-soft/95 shadow-[0_8px_30px_rgba(0,0,0,.5)] backdrop-blur rtn-enter">
          <ul>
            <Card n={n} onRide={onRide} />
          </ul>
        </div>
      ))}
    </div>
  );
}
