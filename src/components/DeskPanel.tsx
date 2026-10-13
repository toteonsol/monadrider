"use client";
/**
 * The desk · earn Perpl funding without betting on direction.
 * Spot MON on Kuru + an equal MON short on Perpl: price moves cancel, funding
 * stays. This panel shows the carry live, what it costs to enter and exit,
 * how many days to break even, and runs both legs from the passkey wallet.
 */
import { useEffect, useState } from "react";
import { useMera, publicClient } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";
import { fetchPerplContext, PERPL, type PerplMarket } from "@/lib/perpl/config";
import { readPosition } from "@/lib/perpl/onchain";
import { carry, loadDesk, openDesk, closeDesk, roundTripCostPct, DESK_LEVERAGE, type DeskPosition } from "@/lib/desk";
import { ActionStatus, explainError, type ActionState } from "./ActionStatus";
import { radio } from "@/lib/radio";
import { logActivity } from "@/lib/activity";
import { usd, signedUsd, price } from "@/lib/fmt";
import { TxLink } from "./TxLink";

export function DeskPanel({ onMoney }: { onMoney: () => void }) {
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const [m, setM] = useState<PerplMarket | null>(null);
  const [fund, setFund] = useState<{ rate: number; every: number } | null>(null);
  const [size, setSize] = useState(20);
  const [cost, setCost] = useState<number | null>(null);
  const [desk, setDesk] = useState<DeskPosition | null>(null);
  const [perpNow, setPerpNow] = useState<{ size: number; mark: number } | null>(null);
  const [st, setSt] = useState<ActionState>({ phase: "idle" });

  // live funding + market
  useEffect(() => {
    let dead = false;
    const read = async () => {
      try {
        const [ctx, raw] = await Promise.all([
          fetchPerplContext(),
          fetch(`/api/perpl/context${PERPL.isTestnet ? "?testnet=true" : ""}`).then((r) => r.json()) as Promise<{ markets?: { name: string; funding?: { rate?: number }; funding_interval_sec?: number }[] }>,
        ]);
        if (dead) return;
        setM(ctx.markets.MON ?? null);
        const r = raw.markets?.find((x) => x.name === "MON");
        if (r) setFund({ rate: Number(r.funding?.rate ?? 0), every: Number(r.funding_interval_sec ?? 3600) });
      } catch {}
    };
    void read();
    const t = setInterval(read, 15_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (mera.address) setDesk(loadDesk(mera.address));
  }, [mera.address]);

  // the perp leg as Perpl sees it
  useEffect(() => {
    if (!desk || !m || !perpl.account) return;
    let dead = false;
    const read = () =>
      readPosition(publicClient, m, perpl.account!.id)
        .then((p) => !dead && setPerpNow({ size: p.side === -1 ? p.size : 0, mark: p.mark || m.mid }))
        .catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [desk, m, perpl.account]);

  // what entering and leaving costs, from real Kuru quotes (refreshed when size settles)
  useEffect(() => {
    if (!m) return;
    setCost(null);
    // quotes are public prices; before login, price with a placeholder address
    const who = (mera.address ?? "0x000000000000000000000000000000000000dEaD") as `0x${string}`;
    const t = setTimeout(() => {
      roundTripCostPct(who, size, m.takerFeeBps).then(setCost).catch(() => setCost(null));
    }, 900);
    return () => clearTimeout(t);
  }, [mera.address, m, size]);

  const c = fund ? carry(fund.rate, fund.every) : null;
  const perDayUsd = c ? (c.perDayPct / 100) * size : 0;
  const breakeven = c && cost != null && c.perDayPct > 0 ? cost / c.perDayPct : null;
  const marginNeeded = size / DESK_LEVERAGE;
  const free = perpl.account?.free ?? 0;
  const walletAusd = mera.balances?.ausd ?? 0;
  const ready = !!mera.wallet && !!perpl.account && free >= marginNeeded * 1.15 && walletAusd >= size && (mera.balances?.mon ?? 0) >= 0.2;

  async function open() {
    if (!mera.wallet || !perpl.account || !m) return;
    setSt({ phase: "busy", step: "Starting the desk…" });
    try {
      const d = await openDesk({ pc: publicClient, w: mera.wallet, market: m, accountId: perpl.account.id, usd: size, onStep: (s) => setSt({ phase: "busy", step: s }) });
      setDesk(d);
      setSt({ phase: "done", title: `Desk open · ${d.mon.toFixed(1)} MON spot, ${d.perpSize} MON short`, lines: ["Price moves now cancel out; Perpl funding accrues to your margin."], txs: d.txs });
      radio({ kind: "wallet", tone: "good", title: "Desk open on Monad", body: `Long ${d.mon.toFixed(1)} MON on Kuru, short ${d.perpSize} MON on Perpl. Funding is the trade now.`, tx: d.txs.at(-1)?.hash });
      logActivity({ owner: mera.address, kind: "swap", route: "passkey", title: `Desk open: bought ${d.mon.toFixed(1)} MON (spot) + short ${d.perpSize} MON (Perpl)`, side: "buy", amountIn: size, out: d.mon, txs: d.txs });
      void mera.refresh();
      void perpl.refresh();
    } catch (e) {
      const x = explainError(e);
      setSt({ phase: "error", ...x });
    }
  }

  async function close() {
    if (!mera.wallet || !perpl.account || !m || !desk) return;
    setSt({ phase: "busy", step: "Closing the desk…" });
    try {
      const r = await closeDesk({ pc: publicClient, w: mera.wallet, market: m, accountId: perpl.account.id, desk, onStep: (s) => setSt({ phase: "busy", step: s }) });
      setDesk(null);
      setSt({ phase: "done", title: `Desk closed · ${usd(r.ausdOut)} AUSD back from Kuru`, lines: ["The short is bought back; funding earned stays in your Perpl margin."], txs: r.txs });
      radio({ kind: "wallet", tone: "good", title: "Desk closed", body: "Both legs unwound on Monad.", tx: r.txs.at(-1)?.hash });
      logActivity({ owner: mera.address, kind: "swap", route: "passkey", title: "Desk closed: short bought back (Perpl) + MON sold (Kuru)", side: "sell", amountIn: desk.mon, out: r.ausdOut, txs: r.txs });
      void mera.refresh();
      void perpl.refresh();
    } catch (e) {
      setSt({ phase: "error", ...explainError(e) });
    }
  }

  const mid = m?.mid ?? 0;
  const spotPnl = desk && mid ? desk.mon * mid - desk.usdIn : 0;
  const perpPnl = desk && perpNow && perpNow.size ? -perpNow.size * ((perpNow.mark || mid) - desk.perpEntry) : 0;
  const netDelta = desk ? desk.mon - (perpNow?.size ?? desk.perpSize) : 0;

  return (
    <div className="space-y-4">
      <div className="border-2 border-steel bg-ink-soft">
        <div className="checker h-[6px] w-full opacity-80" aria-hidden />
        <div className="p-4">
          <div className="display text-[11px] font-bold uppercase tracking-[0.16em] text-papaya">The desk · Kuru spot + Perpl short</div>
          <h2 className="display mt-1 text-[22px] font-black uppercase leading-tight text-bone">Earn funding, not direction.</h2>
          <p className="mt-1.5 text-[13px] leading-snug text-flat">
            Hold MON on Kuru and short the same MON on Perpl. If MON rises, the spot gains what the short loses, and the reverse. What's
            left is funding: when longs pay shorts on Perpl, your short collects it every interval. Both legs are your own Monad txs.
          </p>

          {/* live carry */}
          <div className="mt-3 grid grid-cols-2 border-2 border-steel min-[560px]:grid-cols-4">
            <Cell k="MON funding now" v={c ? `${c.perIntervalPct >= 0 ? "+" : "−"}${Math.abs(c.perIntervalPct).toFixed(4)}%` : "…"} sub={fund ? `every ${Math.round(fund.every / 60)} min` : ""} />
            <Cell k="per day" v={c ? `${c.perDayPct.toFixed(3)}%` : "…"} sub={c ? `≈ ${c.aprPct.toFixed(1)}% a year` : ""} tone={c && c.perDayPct > 0 ? "text-chart" : "text-blood"} />
            <Cell k={`on ${usd(size, 0)}`} v={c ? `${signedUsd(perDayUsd, 3)}/day` : "…"} sub="if funding holds" />
            <Cell k="break-even" v={breakeven != null ? `${breakeven < 1 ? "<1" : breakeven.toFixed(1)} days` : c && c.perDayPct <= 0 ? "n/a" : "…"} sub={cost != null ? `entry+exit ≈ ${cost.toFixed(2)}%` : "pricing Kuru…"} />
          </div>
          {c && !c.shortsEarn && (
            <p className="mt-2 text-[12px] text-blood">Right now funding pays longs, so a short pays it. The desk doesn't earn in this regime; wait for funding to flip.</p>
          )}
        </div>
      </div>

      {desk ? (
        <div className="border-2 border-chart bg-ink-soft p-4">
          <div className="display flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-chart">
            <span className="h-2 w-2 animate-pulse rounded-full bg-chart" /> desk open · since {new Date(desk.openedAt).toLocaleTimeString()}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
            <Cell k="spot (Kuru)" v={`+${desk.mon.toFixed(1)} MON`} sub={`@ ${price(desk.spotPrice)}`} />
            <Cell k="short (Perpl)" v={`−${(perpNow?.size ?? desk.perpSize).toFixed(0)} MON`} sub={`@ ${price(desk.perpEntry)} · ${DESK_LEVERAGE}×`} />
            <Cell k="net exposure" v={`${netDelta >= 0 ? "+" : "−"}${Math.abs(netDelta).toFixed(1)} MON`} sub="≈ flat by design" />
            <Cell k="price P&L" v={signedUsd(spotPnl + perpPnl)} sub="legs cancel · funding is extra" tone={spotPnl + perpPnl >= 0 ? "text-chart" : "text-blood"} />
          </div>
          <p className="mt-2 text-[11.5px] text-flat">Funding lands in your Perpl margin each interval. Closing buys the short back first (never naked short), then sells the MON on Kuru.</p>
          <div className="mt-2 space-y-0.5">
            {desk.txs.map((t) => (
              <div key={t.hash} className="flex justify-between gap-2 text-[11.5px]">
                <span className="text-flat">{t.label}</span>
                <TxLink hash={t.hash} />
              </div>
            ))}
          </div>
          <button onClick={() => void close()} disabled={st.phase === "busy"} className="gp-btn display mt-3 w-full border-2 border-blood px-4 py-3 text-[12px] font-black uppercase text-blood disabled:opacity-40">
            close the desk · unwind both legs
          </button>
        </div>
      ) : (
        <div className="border-2 border-steel bg-ink-soft p-4">
          <label className="block">
            <div className="flex justify-between text-[12px]">
              <span className="text-flat">Size (each leg)</span>
              <span className="font-telemetry font-bold text-bone">{usd(size, 0)}</span>
            </div>
            <input type="range" min={10} max={100} step={5} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-1.5 w-full accent-[var(--papaya)]" />
          </label>
          <ul className="mt-3 space-y-1 text-[12px]">
            <Need ok={!!mera.address} t="passkey wallet logged in" />
            <Need ok={walletAusd >= size} t={`${usd(size, 0)} AUSD in the wallet for the Kuru leg (have ${usd(walletAusd)})`} />
            <Need ok={free >= marginNeeded * 1.15} t={`${usd(marginNeeded * 1.15)} free Perpl margin for the ${DESK_LEVERAGE}× short (have ${usd(free)})`} />
            <Need ok={(mera.balances?.mon ?? 0) >= 0.2} t="a little MON for gas (0.2+)" />
          </ul>
          {!ready && (
            <button onClick={onMoney} className="display mt-2 text-[11px] font-bold uppercase text-papaya underline">
              set up in Money →
            </button>
          )}
          <button onClick={() => void open()} disabled={!ready || st.phase === "busy" || (c != null && !c.shortsEarn)} className="gp-btn gp-btn-primary display mt-3 w-full border-2 border-papaya bg-papaya px-4 py-3 text-[12px] font-black uppercase text-ink disabled:opacity-40">
            open the desk · buy on Kuru, short on Perpl
          </button>
          <p className="mt-2 text-[11px] leading-snug text-flat-dim">
            Risks in plain words: funding can flip and start costing the short; the {DESK_LEVERAGE}× short can be liquidated if MON jumps
            roughly 30% before you add margin (the spot leg gains about the same); entry and exit cost the break-even shown above. Capped at $100 a leg.
          </p>
        </div>
      )}
      <ActionStatus s={st} onClear={() => setSt({ phase: "idle" })} />
    </div>
  );
}

function Cell({ k, v, sub, tone = "text-bone" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="border-r border-hairline px-3 py-2.5 last:border-r-0">
      <div className="display text-[9.5px] font-bold uppercase tracking-[0.12em] text-flat">{k}</div>
      <div className={`font-telemetry mt-0.5 text-[15px] font-bold ${tone}`}>{v}</div>
      {sub && <div className="text-[10px] text-flat-dim">{sub}</div>}
    </div>
  );
}

function Need({ ok, t }: { ok: boolean; t: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-chart" : "text-flat"}>{ok ? "✓" : "○"}</span>
      <span className={ok ? "text-bone" : "text-flat"}>{t}</span>
    </li>
  );
}
