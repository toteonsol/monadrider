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
import { erc20Abi } from "viem";
import { AUSD } from "@/lib/monad";
import { quote, swap, type KuruQuote, type SpotToken } from "@/lib/kuru";
import { qty, usd } from "@/lib/fmt";
import { TxLink } from "./TxLink";
import { ActionStatus, explainError, type ActionState } from "./ActionStatus";
import { radio } from "@/lib/radio";
import { logActivity } from "@/lib/activity";
import { LoginCard } from "./LoginCard";

type Side = "buy" | "sell";

export function SpotScreen() {
  const mera = useMera();
  const [side, setSide] = useState<Side>("buy");
  const [amt, setAmt] = useState("5");
  const [q, setQ] = useState<KuruQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [st, setSt] = useState<ActionState>({ phase: "idle" });
  const busy = st.phase === "busy";
  const err = "";
  const [done, setDone] = useState<{ hash: string; text: string }[]>([]);
  const seq = useRef(0);

  const tokenIn: SpotToken = side === "buy" ? "AUSD" : "MON";
  const tokenOut: SpotToken = side === "buy" ? "MON" : "AUSD";
  const n = Number(amt);
  const have = side === "buy" ? (mera.balances?.ausd ?? 0) : Math.max(0, (mera.balances?.mon ?? 0) - 0.05);

  // quote as the rider types (debounced, Kuru allows ~1 req/s)
  useEffect(() => {
    setQ(null);
    if (!mera.address || !(n > 0)) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const r = await quote(mera.address!, tokenIn, tokenOut, n);
        if (my === seq.current) setQ(r);
      } catch (e) {
        if (my === seq.current) setSt({ phase: "error", message: e instanceof Error ? e.message : String(e), hint: "Kuru couldn't price this size right now. Try a smaller amount or again in a moment." });
      } finally {
        if (my === seq.current) setQuoting(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [mera.address, n, tokenIn, tokenOut]);

  async function execute() {
    if (!q || !mera.wallet) return;
    if (Date.now() - q.at > 20_000) return setSt({ phase: "error", message: "That quote is over 20 seconds old.", hint: "Tap the amount again to refresh it." });
    if (n > have + 1e-9)
      return setSt({ phase: "error", message: side === "buy" ? "Not enough AUSD." : "Not enough MON.", hint: side === "buy" ? "Lower the amount, or tap Max." : "0.05 MON is kept back for gas." });
    setSt({ phase: "busy", step: "Preparing the swap…" });
    const before = { mon: mera.balances?.mon ?? 0, ausd: mera.balances?.ausd ?? 0 };
    try {
      const r = await swap(publicClient, mera.wallet, q, (t) => setSt({ phase: "busy", step: t }));
      const title = side === "buy" ? `Bought ${qty(q.out, 2)} MON for ${usd(n)}` : `Sold ${qty(n, 2)} MON for ${usd(q.out)}`;
      await mera.refresh();
      setSt({
        phase: "done",
        title,
        lines: [`Settled on Kuru's order book in one Monad block.`, `Wallet before: ${usd(before.ausd)} AUSD · ${qty(before.mon, 3)} MON`],
        txs: [...(r.approveHash ? [{ label: "Approve AUSD", hash: r.approveHash }] : []), { label: "Swap", hash: r.hash }],
      });
      setDone((d) => [{ hash: r.hash, text: title }, ...d]);
      radio({ kind: "wallet", tone: "good", title, body: "Spot swap on Kuru, settled on Monad. Balances are updated in Money.", tx: r.hash });
      logActivity({ owner: mera.address, kind: "swap", route: "passkey", title, side, amountIn: n, out: q.out, txs: [...(r.approveHash ? [{ label: "Approve AUSD", hash: r.approveHash }] : []), { label: "Swap", hash: r.hash }] });
      setAmt("");
    } catch (e) {
      // ask the chain before calling it a failure
      setSt({ phase: "busy", step: "Checking onchain whether the swap went through…" });
      await new Promise((r) => setTimeout(r, 2500));
      const addr = mera.wallet.account.address;
      const [monNow, ausdNow] = await Promise.all([
        publicClient.getBalance({ address: addr }).then((x) => Number(x) / 1e18).catch(() => before.mon),
        publicClient.readContract({ address: AUSD.address, abi: erc20Abi, functionName: "balanceOf", args: [addr] }).then((x) => Number(x) / 1e6).catch(() => before.ausd),
      ]);
      const moved = side === "buy" ? ausdNow <= before.ausd - n * 0.98 : monNow <= before.mon - n * 0.98;
      const hash = (e as { hash?: string }).hash;
      if (moved) {
        const title = side === "buy" ? `Bought ~${qty(q.out, 2)} MON for ${usd(n)}` : `Sold ${qty(n, 2)} MON for ~${usd(q.out)}`;
        setSt({ phase: "done", title, lines: ["Confirmed onchain (the RPC stumbled on the way back, but the swap landed)."], txs: hash ? [{ label: "Swap", hash }] : [] });
        radio({ kind: "wallet", tone: "good", title, body: "Confirmed onchain.", tx: hash });
        await mera.refresh();
        setAmt("");
        return;
      }
      const x = explainError(e);
      setSt({ phase: "error", message: x.message, hint: `${x.hint ?? ""} Checked onchain: nothing moved.`.trim() });
      radio({ kind: "wallet", tone: "warn", title: "Swap didn't go through", body: `${x.message} Nothing moved onchain.` });
    }
  }

  const px = q ? (side === "buy" ? n / q.out : q.out / n) : 0;

  // logged-out preview: a live Kuru price so the screen is never empty
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => {
    if (mera.address) return;
    let dead = false;
    quote("0x000000000000000000000000000000000000dEaD", "AUSD", "MON", 10)
      .then((r) => !dead && setPreview(10 / r.out))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [mera.address]);

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
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-line bg-ink-3 px-3 py-3">
              <div className="text-xs text-mute">Live on Kuru · 10 AUSD buys</div>
              <div className="num mt-1 text-2xl font-semibold">{preview ? `${qty(10 / preview, 1)} MON` : "…"}</div>
              {preview && <div className="num text-[11px] text-mute">{preview.toFixed(5)} AUSD per MON</div>}
            </div>
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
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    className="btn btn-ghost flex-1 !py-2"
                    disabled={have <= 0}
                    onClick={() => setAmt(side === "buy" ? (Math.floor(have * f * 100) / 100).toFixed(2) : (Math.floor(have * f * 1000) / 1000).toFixed(3))}
                  >
                    {f === 1 ? "max" : `${f * 100}%`}
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
              {busy ? "Working on Monad…" : side === "buy" ? "Buy MON" : "Sell MON"}
            </button>
            <ActionStatus s={st} onClear={() => setSt({ phase: "idle" })} />
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
