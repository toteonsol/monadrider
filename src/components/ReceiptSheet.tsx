"use client";
import type { Receipt } from "@/lib/ride/receipts";
import { signedUsd, usd, price, clock } from "@/lib/fmt";
import { TxLink } from "./TxLink";

const REASON: Record<string, string> = {
  end: "Timer ran out · flattened",
  rider: "You ended the ride",
  "loss-limit": "Max loss reached · the rail ended the ride",
  left: "Left the screen · flattened",
};

const ACTION: Record<string, string> = { "open-long": "Long", "open-short": "Short", close: "Close" };

/** The end-of-ride receipt: result, risk, and every fill with its Monad tx. */
export function ReceiptSheet({ receipt: r, onClose, onSpot }: { receipt: Receipt; onClose: () => void; onSpot?: () => void }) {
  const live = r.mode === "live";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="card max-h-[88dvh] w-full overflow-y-auto rounded-b-none px-5 pb-[calc(20px+var(--safe-bottom))] pt-5 sm:max-w-lg sm:rounded-b-[20px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ride receipt"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="label">
          {r.autopilot ? "Passenger" : "Surfer"} · {r.asset}-PERP · {live ? "Live on Perpl" : "Practice"}
        </div>
        <div className={`font-display mt-1 text-4xl font-bold ${r.net > 0 ? "text-cyan" : r.net < 0 ? "text-pink" : ""}`}>{signedUsd(r.net)}</div>
        <div className="text-sm text-mute">
          {REASON[r.endReason] ?? r.endReason} · {clock(r.endedAt - r.startedAt)}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat k="Trades" v={`${r.trades}`} sub={r.trades ? `${r.wins} won` : ""} />
          <Stat k="Volume" v={usd(r.volume, 0)} />
          <Stat k="Fees" v={usd(r.fees)} />
          <Stat k="Max drawdown" v={usd(r.maxDrawdown)} />
          <Stat k="Stops hit" v={`${r.wipeouts}`} />
          <Stat k="Clip" v={usd(r.rails.clipUsd, 0)} sub={`stop ${r.rails.stopPct}%`} />
        </div>

        <div className="mt-4">
          <div className="label mb-2">Fills{live ? " · each one a Monad transaction" : ""}</div>
          {r.fills.length === 0 && <div className="text-sm text-mute">No trades this ride.</div>}
          <div className="space-y-1.5">
            {r.fills.map((f, i) => (
              <div key={i} className="num flex items-center justify-between gap-2 text-xs">
                <span className={f.action === "open-long" ? "text-cyan" : f.action === "open-short" ? "text-pink" : "text-lavender"}>
                  {ACTION[f.action]}
                  {f.reason === "stop" ? " · stop" : ""}
                </span>
                <span className="flex-1 text-right">{price(f.px)}</span>
                <span className={`w-16 text-right ${f.pnl == null ? "text-mute" : f.pnl >= 0 ? "text-cyan" : "text-pink"}`}>
                  {f.pnl == null ? usd(f.notional, 0) : signedUsd(f.pnl)}
                </span>
                <span className="w-24 text-right">{live ? <TxLink hash={f.txid} /> : <span className="text-mute">practice</span>}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {onSpot && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                onClose();
                onSpot();
              }}
            >
              Bank it in MON · Kuru
            </button>
          )}
          <button className={`btn btn-primary ${onSpot ? "" : "col-span-2"}`} onClick={onClose}>
            Ride again
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-3 px-3 py-2">
      <div className="label !text-[10px]">{k}</div>
      <div className="num text-sm font-semibold">{v}</div>
      {sub && <div className="text-[10px] text-mute">{sub}</div>}
    </div>
  );
}
