"use client";
/**
 * Spot · buy or sell MON with AUSD through Kuru's onchain order book.
 *
 * The perp ride is the game; spot is where a rider banks it. Riding MON on
 * Perpl and then owning MON on Kuru is one motion: the wave you surfed is the
 * asset you buy. It also funds the app itself: MON → AUSD here is how a new
 * rider gets margin without leaving.
 */
import { useEffect, useRef, useState } from "react";
import { useMera, publicClient } from "@/lib/wallet/mera";
import { quote, swap, type KuruQuote, type SpotToken } from "@/lib/kuru";
import { qty, usd } from "@/lib/fmt";
import { TxLink } from "./TxLink";
import { LoginCard } from "./LoginCard";

type Side = "buy" | "sell";

export function SpotScreen() {
  const mera = useMera();
  const [side, setSide] = useState<Side>("buy");
  const [amt, setAmt] = useState("5");
  const [q, setQ] = useState<KuruQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: string; text: string }[]>([]);
  const seq = useRef(0);

  const tokenIn: SpotToken = side === "buy" ? "AUSD" : "MON";
  const tokenOut: SpotToken = side === "buy" ? "MON" : "AUSD";
  const n = Number(amt);
  const have = side === "buy" ? (mera.balances?.ausd ?? 0) : Math.max(0, (mera.balances?.mon ?? 0) - 0.05);

  // quote as the rider types (debounced, Kuru allows ~1 req/s)
  useEffect(() => {
    setQ(null);
    setErr("");
    if (!mera.address || !(n > 0)) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const r = await quote(mera.address!, tokenIn, tokenOut, n);
        if (my === seq.current) setQ(r);
      } catch (e) {
        if (my === seq.current) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (my === seq.current) setQuoting(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [mera.address, n, tokenIn, tokenOut]);

  async function execute() {
    if (!q || !mera.wallet) return;
    if (Date.now() - q.at > 20_000) {
      setErr("Quote is stale. Edit the amount to refresh it.");
      return;
    }
    if (n > have + 1e-9) {
      setErr(side === "buy" ? "Not enough AUSD." : "Not enough MON (0.05 is kept back for gas).");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await swap(publicClient, mera.wallet, q);
      setDone((d) => [
        { hash: r.hash, text: `${side === "buy" ? "Bought" : "Sold"} ${side === "buy" ? qty(q.out, 2) + " MON" : qty(n, 2) + " MON"} for ${side === "buy" ? usd(n) : usd(q.out)}` },
        ...(r.approveHash ? [{ hash: r.approveHash, text: "Approved AUSD for Kuru" }] : []),
        ...d,
      ]);
      setAmt("");
      await mera.refresh();
    } catch (e) {
      const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
      setErr(m.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  const px = q ? (side === "buy" ? n / q.out : q.out / n) : 0;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
      <section className="card px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="label">Spot · MON / AUSD</span>
          <span className="label">Kuru order book</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-ink p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`btn !py-2.5 ${side === s ? (s === "buy" ? "bg-cyan text-ink" : "bg-pink text-ink") : "text-mute"}`}
            >
              {s === "buy" ? "Buy MON" : "Sell MON"}
            </button>
          ))}
        </div>

        {!mera.address ? (
          <div className="mt-4">
            <LoginCard compact />
          </div>
        ) : (
          <>
            <div className="mt-4">
              <div className="flex justify-between text-xs">
                <span className="text-mute">You pay</span>
                <button className="num text-mute hover:text-lavender" onClick={() => setAmt(have > 0 ? (side === "buy" ? have.toFixed(2) : have.toFixed(3)) : "")}>
                  balance {side === "buy" ? usd(have) : `${qty(have, 3)} MON`}
                </button>
              </div>
              <div className="relative mt-1">
                <input
                  inputMode="decimal"
                  value={amt}
                  onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="num w-full rounded-xl border border-line bg-ink-3 px-3 py-4 text-2xl outline-none focus:border-monad"
                  aria-label={`${tokenIn} amount`}
                />
                <span className="label absolute right-3 top-1/2 -translate-y-1/2">{tokenIn}</span>
              </div>
              <div className="mt-2 flex gap-2">
                {(side === "buy" ? [5, 10, 25] : [100, 500, 1000]).map((v) => (
                  <button key={v} className="btn btn-ghost flex-1 !py-2" onClick={() => setAmt(String(v))}>
                    {side === "buy" ? `$${v}` : `${v}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-ink-3 px-3 py-3">
              <div className="flex justify-between text-xs text-mute">
                <span>You get</span>
                <span>{quoting ? "quoting…" : q ? "best route on Kuru" : ""}</span>
              </div>
              <div className="num mt-1 text-2xl font-semibold">
                {q ? `${tokenOut === "MON" ? qty(q.out, 2) : usd(q.out)} ${tokenOut === "MON" ? "MON" : ""}` : "—"}
              </div>
              {q && (
                <div className="num mt-1 space-y-0.5 text-[11px] text-mute">
                  <div>price {px.toFixed(5)} AUSD / MON</div>
                  <div>
                    at least {tokenOut === "MON" ? `${qty(q.minOut, 2)} MON` : usd(q.minOut)} after slippage
                  </div>
                </div>
              )}
            </div>

            {err && <p className="mt-2 text-sm text-pink">{err}</p>}
            <button className="btn btn-primary glow mt-4 w-full !py-4" disabled={!q || busy || quoting} onClick={() => void execute()}>
              {busy ? "Swapping on Monad…" : side === "buy" ? "Buy MON" : "Sell MON"}
            </button>
          </>
        )}

        {done.length > 0 && (
          <div className="mt-4 space-y-1">
            {done.slice(0, 6).map((d) => (
              <div key={d.hash} className="flex justify-between gap-2 text-xs">
                <span className="text-lavender">{d.text}</span>
                <TxLink hash={d.hash} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card px-5 py-4 text-sm leading-relaxed text-lavender/90">
        <div className="label mb-2">Why spot lives here</div>
        Ride MON on the wave, then own it. Selling MON here is also the quickest way to get AUSD margin for live rides, all
        without leaving the app. Orders route through Kuru&apos;s onchain order book and settle in one Monad block.
      </section>
    </div>
  );
}
