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
import { Logbook } from "./Logbook";
import { SendFunds } from "./SendFunds";
import { WalletSwitcher } from "./WalletSwitcher";
import { ActionStatus, explainError, type ActionState } from "./ActionStatus";
import { radio } from "@/lib/radio";
import { logActivity } from "@/lib/activity";

const MIN_OPEN = 10; // Perpl's minimum to open an account, and for every deposit (AUSD)

export function MoneyScreen({ goSpot }: { goSpot: () => void }) {
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const [copied, setCopied] = useState(false);

  if (!mera.address) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
        <LoginCard />
        <Logbook owner={null} />
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
        <SendFunds />
        <WalletSwitcher />
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
        <Logbook owner={mera.address} />
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
  const [st, setSt] = useState<ActionState>({ phase: "idle" });
  const busy = st.phase === "busy";
  const n = Number(amt);
  const needOpen = loaded && !account;

  async function run(dir: "in" | "out") {
    if (!mera.wallet) return setSt({ phase: "error", message: "The wallet is locked.", hint: "Log in with your passkey above." });
    if (!(n > 0)) return setSt({ phase: "error", message: `Enter an amount to ${dir === "in" ? "deposit" : "withdraw"}.`, hint: dir === "in" ? `At least ${MIN_OPEN} AUSD.` : "Tap Max free to take everything that's free." });
    if (dir === "in") {
      if (n < MIN_OPEN) return setSt({ phase: "error", message: needOpen ? `Perpl needs at least ${MIN_OPEN} AUSD to open an account.` : `Perpl's smallest deposit is ${MIN_OPEN} AUSD.` });
      if (n > walletAusd + 1e-9) return setSt({ phase: "error", message: "More than the AUSD in your wallet.", hint: "Swap MON → AUSD on Spot, or lower the amount." });
    } else {
      if (!account) return setSt({ phase: "error", message: "No Perpl account yet.", hint: `Deposit ${MIN_OPEN}+ AUSD first.` });
      if (n < 0.01) return setSt({ phase: "error", message: "Perpl's smallest withdrawal is 0.01 AUSD." });
      if (n > account.free + 1e-9) return setSt({ phase: "error", message: "More than your free margin.", hint: "Margin inside an open position unlocks when the position closes." });
    }
    const step = (t: string) => setSt({ phase: "busy", step: t });
    try {
      if (dir === "in") {
        const r = await depositAusd(publicClient, mera.wallet, n, step);
        const title = r.created ? `Perpl account opened with ${usd(n)} AUSD` : `Deposited ${usd(n)} AUSD into Perpl`;
        setSt({
          phase: "done",
          title,
          lines: ["It's now margin you can ride with: open Trade and go live."],
          txs: [...(r.approve ? [{ label: "Approve AUSD", hash: r.approve.hash }] : []), { label: r.created ? "Open account + deposit" : "Deposit", hash: r.tx.hash }],
        });
        radio({ kind: "wallet", tone: "good", title, body: "Margin is ready on Perpl. Open Trade and go live.", tx: r.tx.hash });
        logActivity({ owner: mera.address, kind: "deposit", route: "passkey", amount: n, created: r.created, txs: [...(r.approve ? [{ label: "Approve AUSD", hash: r.approve.hash }] : []), { label: r.created ? "Open account + deposit" : "Deposit", hash: r.tx.hash }] });
      } else {
        const r = await withdrawAusd(publicClient, mera.wallet, n, step);
        const title = `Withdrew ${usd(n)} AUSD to your wallet`;
        setSt({ phase: "done", title, lines: ["It's in this wallet now. Send it anywhere below."], txs: [{ label: "Withdraw", hash: r.hash }] });
        radio({ kind: "wallet", tone: "good", title, body: "Back in your passkey wallet.", tx: r.hash });
        logActivity({ owner: mera.address, kind: "withdraw", route: "passkey", amount: n, txs: [{ label: "Withdraw", hash: r.hash }] });
      }
      setAmt("");
      await onDone();
    } catch (e) {
      const x = explainError(e);
      setSt({ phase: "error", ...x });
      radio({ kind: "wallet", tone: "warn", title: `${dir === "in" ? "Deposit" : "Withdrawal"} didn't go through`, body: x.hint ? `${x.message} ${x.hint}` : x.message });
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
            placeholder={`${MIN_OPEN}+ to deposit · any to withdraw`}
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            className="num w-full rounded-xl border border-line bg-ink-3 px-3 py-3 text-lg outline-none focus:border-monad"
            aria-label="AUSD amount"
          />
          <span className="label absolute right-3 top-1/2 -translate-y-1/2">AUSD</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <button className="btn btn-ghost !px-2.5 !py-1.5 !text-[10.5px]" onClick={() => setAmt((Math.floor(walletAusd * 100) / 100).toFixed(2))}>
          max wallet {usd(walletAusd)}
        </button>
        {account && (
          <button className="btn btn-ghost !px-2.5 !py-1.5 !text-[10.5px]" onClick={() => setAmt((Math.floor(account.free * 100) / 100).toFixed(2))}>
            max free {usd(account.free)}
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => void run("in")}>
          {needOpen ? "Open + deposit" : "Deposit"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => void run("out")}>
          Withdraw
        </button>
      </div>
      <ActionStatus s={st} onClear={() => setSt({ phase: "idle" })} />
    </section>
  );
}
