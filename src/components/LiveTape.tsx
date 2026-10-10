"use client";
import type { TapeTrade } from "@/lib/perpl/market";
import { price, qty } from "@/lib/fmt";
import { TxLink } from "./TxLink";

/** Perpl's live trades for the market, each with the Monad tx that settled it. */
export function LiveTape({ tape, asset, limit = 14 }: { tape: TapeTrade[]; asset: string; limit?: number }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="label">Live on Monad · {asset}</span>
        <span className="label">tx</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {tape.length === 0 && <div className="text-sm text-mute">Waiting for the next trade…</div>}
        {tape.slice(0, limit).map((t, i) => (
          <div key={`${t.txid}-${i}`} className="num flex items-center justify-between gap-2 text-xs">
            <span className={t.side === "buy" ? "text-cyan" : "text-pink"}>{t.side === "buy" ? "BUY " : "SELL"}</span>
            <span className="flex-1 text-right">{price(t.px)}</span>
            <span className="w-16 text-right text-mute">{qty(t.size, 3)}</span>
            <span className="w-24 text-right">
              <TxLink hash={t.txid} />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-mute">
        Perpl matches every order onchain. Each row settled in a Monad block, so a 400 ms chain is what makes a price wave you can ride.
      </p>
    </div>
  );
}
