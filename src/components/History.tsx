"use client";
import { useEffect, useState } from "react";
import { loadReceipts, type Receipt } from "@/lib/ride/receipts";
import { signedUsd, usd } from "@/lib/fmt";
import { ReceiptSheet } from "./ReceiptSheet";

/** Past rides kept in this browser, newest first. Tap one for the full receipt. */
export function History({ owner }: { owner: string | null }) {
  const [list, setList] = useState<Receipt[]>([]);
  const [open, setOpen] = useState<Receipt | null>(null);
  useEffect(() => {
    setList([...loadReceipts(owner), ...(owner ? loadReceipts(null) : [])].sort((a, b) => b.startedAt - a.startedAt));
  }, [owner]);

  const live = list.filter((r) => r.mode === "live");
  const net = live.reduce((a, r) => a + r.net, 0);
  const vol = live.reduce((a, r) => a + r.volume, 0);

  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="label">Ride history</span>
        {live.length > 0 && (
          <span className="num text-xs text-mute">
            live {signedUsd(net)} · {usd(vol, 0)} vol
          </span>
        )}
      </div>
      {list.length === 0 && <p className="mt-2 text-sm text-mute">No rides yet. Paddle into a practice ride to start.</p>}
      <div className="mt-2 divide-y divide-line">
        {list.slice(0, 12).map((r) => (
          <button key={r.id} className="flex w-full items-center justify-between py-2 text-left" onClick={() => setOpen(r)}>
            <div>
              <div className="text-sm">
                {r.autopilot ? "Passenger" : "Surfer"} · {r.asset}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${r.mode === "live" ? "bg-monad/30 text-lavender" : "bg-ink-3 text-mute"}`}>
                  {r.mode}
                </span>
              </div>
              <div className="text-[11px] text-mute">
                {new Date(r.startedAt).toLocaleString()} · {r.trades} trades
              </div>
            </div>
            <span className={`num text-sm ${r.net > 0 ? "text-cyan" : r.net < 0 ? "text-pink" : ""}`}>{signedUsd(r.net)}</span>
          </button>
        ))}
      </div>
      {open && <ReceiptSheet receipt={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
