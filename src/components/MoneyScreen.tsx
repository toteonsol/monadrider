"use client";
/**
 * Money · the passkey wallet, the AUSD balance, and the Perpl margin it funds.
 *
 *   Wallet (Mera)  ── deposit ─▶  Perpl margin (AUSD)  ── rides ─▶  P&L
 *        ▲                             │
 *        └──────────── withdraw ───────┘
 *
 * AUSD arrives by sending it to the passkey address, or by swapping MON on
 * Kuru (the Spot tab). Every action here is the rider's own Monad tx.
 */
import { useState } from "react";
import { useMera, publicClient } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";
import { depositAusd, withdrawAusd } from "@/lib/perpl/onchain";
import { addressUrl, AUSD } from "@/lib/monad";
import { usd, qty, short } from "@/lib/fmt";
import { TxLink } from "./TxLink";
import { LoginCard } from "./LoginCard";
import { History } from "./History";

const MIN_OPEN = 10; // Perpl's minimum to open an account (AUSD)

export function MoneyScreen({ goSpot }: { goSpot: () => void }) {
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const [copied, setCopied] = useState(false);

  if (!mera.address) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
        <LoginCard />
        <History owner={null} />
      </div>
    );
  }

  const b = mera.balances;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mera.address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="card px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="label">Passkey wallet · Mera</span>
            <button className="label hover:text-lavender" onClick={mera.lock}>
              Lock
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="label !text-[10px]">AUSD</div>
              <div className="num text-2xl font-semibold">{b ? usd(b.ausd) : "…"}</div>
            </div>
            <div>
              <div className="label !text-[10px]">MON · gas</div>
              <div className="num text-2xl font-semibold">{b ? qty(b.mon, 3) : "…"}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-line bg-ink-3 px-3 py-2">
            <div className="label !text-[10px]">Receive AUSD or MON on Monad</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <a href={addressUrl(mera.address)} target="_blank" rel="noreferrer" className="num truncate text-sm text-lavender">
                <span className="hidden sm:inline">{mera.address}</span>
                <span className="sm:hidden">{short(mera.address)}</span>
              </a>
              <button className="btn btn-ghost !px-3 !py-1.5 !text-[11px]" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={goSpot}>
              Swap MON → AUSD
            </button>
            <button className="btn btn-ghost" onClick={() => void mera.refresh()}>
              Refresh
            </button>
          </div>
          {b && b.mon < 0.05 && (
            <p className="mt-3 text-xs text-amber">Send a little MON to this address first. Every carve is a Monad transaction and needs gas.</p>
          )}
        </section>

        <PerplMargin
          account={perpl.account}
          loaded={perpl.loaded}
          walletAusd={b?.ausd ?? 0}
          onDone={async () => {
            await Promise.all([perpl.refresh(), mera.refresh()]);
          }}
        />
      </div>

      <div className="space-y-4">
        <section className="card px-5 py-4 text-sm leading-relaxed">
          <div className="label mb-2">How the money flows</div>
          <ol className="list-decimal space-y-1 pl-5 text-lavender/90">
            <li>Your passkey is your wallet. Same passkey, same address, on every device it syncs to.</li>
            <li>Hold AUSD (Agora&apos;s dollar) in it. Swap from MON on Kuru, or send it in.</li>
            <li>Move AUSD into Perpl margin. Perpl margins everything in AUSD.</li>
            <li>Ride. Each carve is an order you sign from this tab, settled on Monad.</li>
            <li>Withdraw back to the wallet whenever you like.</li>
          </ol>
        </section>
        <History owner={mera.address} />
      </div>
    </div>
  );
}

function PerplMargin({
  account,
  loaded,
  walletAusd,
  onDone,
}: {
  account: { id: bigint; free: number; locked: number } | null;
  loaded: boolean;
  walletAusd: number;
  onDone: () => Promise<void>;
}) {
  const mera = useMera();
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState<"" | "in" | "out">("");
  const [err, setErr] = useState("");
  const [txs, setTxs] = useState<{ label: string; hash: string }[]>([]);
  const n = Number(amt);
  const needOpen = loaded && !account;

  async function run(dir: "in" | "out") {
    if (!mera.wallet || !(n > 0)) return;
    setErr("");
    setBusy(dir);
    try {
      if (dir === "in") {
        if (needOpen && n < MIN_OPEN) throw new Error(`Perpl needs at least ${MIN_OPEN} AUSD to open an account.`);
        if (n > walletAusd + 1e-9) throw new Error("More than the AUSD in your wallet.");
        const r = await depositAusd(publicClient, mera.wallet, n);
        setTxs((t) => [
          ...(r.approve ? [{ label: "Approve AUSD", hash: r.approve.hash }] : []),
          { label: r.created ? "Open Perpl account" : "Deposit", hash: r.tx.hash },
          ...t,
        ]);
      } else {
        if (n > (account?.free ?? 0) + 1e-9) throw new Error("More than your free margin.");
        const r = await withdrawAusd(publicClient, mera.wallet, n);
        setTxs((t) => [{ label: "Withdraw", hash: r.hash }, ...t]);
      }
      setAmt("");
      await onDone();
    } catch (e) {
      const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
      setErr(m.split("\n")[0]);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="label">Perpl margin · AUSD</span>
        {account && <span className="label">acct #{account.id.toString()}</span>}
      </div>
      {!loaded ? (
        <div className="mt-3 text-sm text-mute">Reading Perpl…</div>
      ) : account ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="label !text-[10px]">Free</div>
            <div className="num text-2xl font-semibold">{usd(account.free)}</div>
          </div>
          <div>
            <div className="label !text-[10px]">In orders</div>
            <div className="num text-2xl font-semibold">{usd(account.locked)}</div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-lavender/90">
          No Perpl account yet. Your first deposit (at least {MIN_OPEN} {AUSD.symbol}) opens one on the Exchange contract.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            inputMode="decimal"
            placeholder={needOpen ? `${MIN_OPEN}+` : "0.00"}
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            className="num w-full rounded-xl border border-line bg-ink-3 px-3 py-3 text-lg outline-none focus:border-monad"
            aria-label="AUSD amount"
          />
          <span className="label absolute right-3 top-1/2 -translate-y-1/2">AUSD</span>
        </div>
        <button className="btn btn-ghost !px-3" onClick={() => setAmt(walletAusd.toFixed(2))}>
          Max
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-primary" disabled={!!busy || !(n > 0)} onClick={() => void run("in")}>
          {busy === "in" ? "Sending…" : needOpen ? "Open + deposit" : "Deposit"}
        </button>
        <button className="btn btn-ghost" disabled={!!busy || !(n > 0) || !account} onClick={() => void run("out")}>
          {busy === "out" ? "Sending…" : "Withdraw"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-pink">{err}</p>}
      {txs.length > 0 && (
        <div className="mt-3 space-y-1">
          {txs.slice(0, 5).map((t) => (
            <div key={t.hash} className="flex justify-between text-xs">
              <span className="text-mute">{t.label}</span>
              <TxLink hash={t.hash} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
