"use client";
/**
 * The logbook · everything you did, what it cost, what it earned, and the
 * Monad tx behind each step. Live rides (passkey or Perpl API key), practice
 * runs, Kuru swaps, Perpl margin moves and sends, filterable, with totals that
 * answer the real questions: how much did I trade, what did it cost per $1M,
 * how often did I win, and is it all onchain?
 */
import { useEffect, useMemo, useState } from "react";
import { loadActivity, type Activity, type Route } from "@/lib/activity";
import { loadReceipts, type Receipt } from "@/lib/ride/receipts";
import { listRides, type RideRecord } from "@/lib/game/rideLog";
import { fetchRecentRides } from "@/lib/game/backend";
import { addressUrl } from "@/lib/monad";
import { usd, signedUsd, price, clock } from "@/lib/fmt";
import { TxLink } from "./TxLink";

type Row = Activity | { kind: "practice"; id: string; at: number; route: "practice"; rec: RideRecord };
type Filter = "all" | "live" | "practice" | "margin" | "spot" | "transfer";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["live", "Live rides"],
  ["practice", "Practice"],
  ["margin", "Perpl margin"],
  ["spot", "Kuru spot"],
  ["transfer", "Sends"],
];

const ROUTE: Record<Route, { label: string; cls: string }> = {
  passkey: { label: "passkey · Mera", cls: "border-papaya text-papaya" },
  apikey: { label: "Perpl API key", cls: "border-sky text-sky" },
  practice: { label: "practice", cls: "border-steel text-flat" },
};

const REASON: Record<string, string> = {
  end: "timer ended it",
  rider: "you ended it",
  "loss-limit": "max loss ended it",
  left: "left the screen · flattened",
};

const when = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function Logbook({ owner }: { owner: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [verifiedTx, setVerifiedTx] = useState<Set<string>>(new Set());

  useEffect(() => {
    const read = () => {
      const acts = loadActivity();
      const known = new Set(acts.filter((a) => a.kind === "ride").map((a) => (a as { receipt: Receipt }).receipt.id));
      // live receipts saved before the ledger existed
      // every receipt this browser holds, whichever wallet or key rode it
      const all: Receipt[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith("rtn-monad-receipts-")) all.push(...(JSON.parse(localStorage.getItem(k) || "[]") as Receipt[]));
        }
      } catch {}
      const older: Row[] = (all.length ? all : loadReceipts(owner))
        .filter((r) => r.mode === "live" && !known.has(r.id))
        .map((r) => ({ kind: "ride", id: r.id, at: r.endedAt, route: r.owner && owner && r.owner.toLowerCase() === owner.toLowerCase() ? "passkey" : "apikey", receipt: r }) as Row);
      const practice: Row[] = listRides()
        .filter((r) => !r.live)
        .map((rec) => ({ kind: "practice", id: rec.id, at: rec.ts, route: "practice", rec }));
      setRows([...acts, ...older, ...practice].sort((a, b) => b.at - a.at));
    };
    read();
    window.addEventListener("rtn-activity", read);
    window.addEventListener("focus", read);
    void fetchRecentRides(30 * 86_400_000).then((rs) => setVerifiedTx(new Set(rs.filter((r) => r.live && r.tx).map((r) => r.tx!.toLowerCase()))));
    return () => {
      window.removeEventListener("rtn-activity", read);
      window.removeEventListener("focus", read);
    };
  }, [owner]);

  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "live"
        ? r.kind === "ride"
        : filter === "practice"
          ? r.kind === "practice"
          : filter === "margin"
            ? r.kind === "deposit" || r.kind === "withdraw"
            : filter === "spot"
              ? r.kind === "swap"
              : r.kind === "send",
  );

  const totals = useMemo(() => {
    const live = rows.filter((r) => r.kind === "ride").map((r) => (r as { receipt: Receipt }).receipt);
    const vol = live.reduce((a, r) => a + r.volume, 0);
    const fees = live.reduce((a, r) => a + r.fees, 0);
    const trades = live.reduce((a, r) => a + r.trades, 0);
    const wins = live.reduce((a, r) => a + r.wins, 0);
    const txs = rows.reduce((a, r) => {
      if (r.kind === "ride") return a + r.receipt.fills.filter((f) => f.txid).length;
      if (r.kind === "practice") return a;
      return a + r.txs.length;
    }, 0);
    return {
      rides: live.length,
      vol,
      net: live.reduce((a, r) => a + r.net, 0),
      fees,
      perM: vol > 0 ? (fees / vol) * 1e6 : null,
      win: trades ? wins / trades : null,
      txs,
    };
  }, [rows]);

  return (
    <section className="border-2 border-steel bg-ink-soft">
      <div className="checker h-[6px] w-full opacity-80" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-3">
        <div>
          <div className="display text-[20px] font-black uppercase text-bone">Logbook</div>
          <div className="text-[12px] text-flat">every ride, swap and transfer, with its Monad tx</div>
        </div>
        {owner && (
          <a href={addressUrl(owner)} target="_blank" rel="noreferrer" className="display border-2 border-steel px-2.5 py-1 text-[10.5px] font-bold uppercase text-flat hover:text-bone">
            passkey wallet on MonadScan ↗
          </a>
        )}
      </div>

      {/* the numbers that matter */}
      <div className="mt-3 grid grid-cols-3 border-y-2 border-steel min-[640px]:grid-cols-6">
        <Tot k="live rides" v={`${totals.rides}`} />
        <Tot k="live volume" v={usd(totals.vol, 0)} />
        <Tot k="net" v={signedUsd(totals.net)} tone={totals.net > 0 ? "text-chart" : totals.net < 0 ? "text-blood" : "text-bone"} />
        <Tot k="cost per $1M" v={totals.perM != null ? usd(totals.perM, 0) : "—"} sub="fees ÷ volume" />
        <Tot k="win rate" v={totals.win != null ? `${Math.round(totals.win * 100)}%` : "—"} sub="of round trips" />
        <Tot k="onchain txs" v={`${totals.txs}`} tone="text-chart" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`display shrink-0 border-2 px-2.5 py-1 text-[10.5px] font-black uppercase ${filter === f ? "border-papaya bg-papaya text-ink" : "border-steel text-flat hover:text-bone"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="px-4 pb-5 text-[13px] text-flat">Nothing here yet. Rides, swaps and transfers land here the moment they settle.</p>}
      <ul className="divide-y divide-hairline border-t border-hairline">
        {shown.map((r) => (
          <Entry key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} verifiedTx={verifiedTx} />
        ))}
      </ul>
    </section>
  );
}

function Tot({ k, v, sub, tone = "text-bone" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="border-r border-hairline px-3 py-2.5 last:border-r-0 max-[639px]:[&:nth-child(3)]:border-r-0 max-[639px]:[&:nth-child(-n+3)]:border-b">
      <div className="display text-[9.5px] font-bold uppercase tracking-[0.14em] text-flat">{k}</div>
      <div className={`display mt-0.5 text-[16px] font-bold tabular-nums ${tone}`}>{v}</div>
      {sub && <div className="text-[9.5px] text-flat-dim">{sub}</div>}
    </div>
  );
}

function Badge({ route }: { route: Route }) {
  const r = ROUTE[route];
  return <span className={`display shrink-0 border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${r.cls}`}>{r.label}</span>;
}

function Entry({ r, open, onToggle, verifiedTx }: { r: Row; open: boolean; onToggle: () => void; verifiedTx: Set<string> }) {
  let icon = "◆";
  let title = "";
  let right: { v: string; tone: string } = { v: "", tone: "text-bone" };
  let sub = "";
  if (r.kind === "ride") {
    const x = r.receipt;
    icon = x.autopilot ? "◎" : "▶";
    title = `${x.autopilot ? "Passenger" : "You drove"} · ${x.asset}-PERP`;
    right = { v: signedUsd(x.net), tone: x.net > 0 ? "text-chart" : x.net < 0 ? "text-blood" : "text-bone" };
    sub = `${x.trades} round trips · ${usd(x.volume, 0)} volume · ${clock(x.endedAt - x.startedAt)}`;
  } else if (r.kind === "practice") {
    icon = "○";
    title = `Practice · ${r.rec.mode === "3d" ? "RIDE" : r.rec.mode === "surf" ? "SURFER" : r.rec.mode === "pulse" ? "PULSE" : r.rec.mode}`;
    right = { v: `${r.rec.points.toLocaleString()} pts`, tone: "text-amber" };
    sub = `${usd(r.rec.sim.volume, 0)} would-be volume · ${r.rec.sim.crashes} crashes`;
  } else if (r.kind === "swap") {
    icon = "⇄";
    title = `Kuru · ${r.title}`;
    right = { v: r.side === "buy" ? `−${usd(r.amountIn)}` : `+${usd(r.out)}`, tone: "text-bone" };
    sub = "spot on Kuru's order book";
  } else if (r.kind === "deposit" || r.kind === "withdraw") {
    icon = r.kind === "deposit" ? "↓" : "↑";
    title = r.kind === "deposit" ? (r.created ? "Opened Perpl account" : "Deposit to Perpl margin") : "Withdraw from Perpl margin";
    right = { v: `${r.kind === "deposit" ? "−" : "+"}${usd(r.amount)} AUSD`, tone: "text-bone" };
    sub = r.kind === "deposit" ? "wallet → Perpl" : "Perpl → wallet";
  } else if (r.kind === "send") {
    icon = "→";
    title = `Sent ${r.token}`;
    right = { v: `−${r.token === "AUSD" ? usd(r.amount) : r.amount.toFixed(4) + " MON"}`, tone: "text-bone" };
    sub = `to ${r.to.slice(0, 6)}…${r.to.slice(-4)}`;
  }
  const fills = r.kind === "ride" ? r.receipt.fills : [];
  const verified = r.kind === "ride" && fills.some((f) => f.txid && verifiedTx.has(f.txid.toLowerCase()));

  return (
    <li>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-ink" aria-expanded={open}>
        <span className="grid h-8 w-8 shrink-0 place-items-center border border-steel bg-ink text-[14px] text-papaya" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="display text-[13px] font-bold text-bone">{title}</span>
            <Badge route={r.route} />
            {verified && <span className="display border border-chart px-1.5 py-0.5 text-[9px] font-black uppercase text-chart">✓ verified onchain</span>}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-flat">
            {when(r.at)} · {sub}
          </span>
        </span>
        <span className={`font-telemetry shrink-0 text-[13px] font-bold ${right.tone}`}>{right.v}</span>
      </button>
      {open && (
        <div className="border-t border-hairline bg-ink px-4 py-3 text-[12px]">
          {r.kind === "ride" && (
            <>
              <div className="grid grid-cols-3 gap-2 min-[560px]:grid-cols-6">
                <Mini k="net" v={signedUsd(r.receipt.net)} />
                <Mini k="volume" v={usd(r.receipt.volume, 0)} />
                <Mini k="fees" v={usd(r.receipt.fees)} />
                <Mini k="drawdown" v={usd(r.receipt.maxDrawdown)} />
                <Mini k="stops" v={`${r.receipt.wipeouts}`} />
                <Mini k="clip" v={usd(r.receipt.rails.clipUsd, 0)} />
              </div>
              <div className="mt-2 text-flat">
                {REASON[r.receipt.endReason] ?? r.receipt.endReason} · {r.receipt.wins}/{r.receipt.trades} won ·{" "}
                {r.receipt.volume > 0 ? `${usd((r.receipt.fees / r.receipt.volume) * 1e6, 0)} per $1M` : ""}
              </div>
              <div className="mt-2 space-y-1">
                {fills.map((f, i) => (
                  <div key={i} className="font-telemetry flex items-center justify-between gap-2 text-[11.5px]">
                    <span className={f.action === "open-long" ? "text-chart" : f.action === "open-short" ? "text-blood" : "text-bone"}>
                      {f.action === "open-long" ? "LONG " : f.action === "open-short" ? "SHORT" : "CLOSE"}
                      {f.reason === "stop" ? " · stop" : f.reason === "take" ? " · take" : ""}
                    </span>
                    <span className="flex-1 text-right">{price(f.px)}</span>
                    <span className={`w-16 text-right ${f.pnl == null ? "text-flat" : f.pnl >= 0 ? "text-chart" : "text-blood"}`}>{f.pnl == null ? usd(f.notional, 0) : signedUsd(f.pnl)}</span>
                    <span className="w-28 text-right">
                      <TxLink hash={f.txid} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {r.kind === "practice" && <p className="text-flat">Practice: no money moved. Live, those lanes would have been Perpl orders; practice points cap at 150 a ride.</p>}
          {"txs" in r &&
            r.txs.map((t) => (
              <div key={t.hash} className="flex justify-between gap-2">
                <span className="text-flat">{t.label}</span>
                <TxLink hash={t.hash} />
              </div>
            ))}
        </div>
      )}
    </li>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-hairline px-2 py-1.5">
      <div className="display text-[9px] font-bold uppercase tracking-[0.12em] text-flat">{k}</div>
      <div className="font-telemetry text-[12.5px] font-bold text-bone">{v}</div>
    </div>
  );
}
