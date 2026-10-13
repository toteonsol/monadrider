"use client";
/**
 * Send · move AUSD or MON out of the passkey wallet to any Monad address,
 * e.g. back to the wallet you funded it from. The passkey wallet is a normal
 * Monad account; this is its way out.
 */
import { useState } from "react";
import { erc20Abi, isAddress, parseUnits } from "viem";
import { useMera, publicClient } from "@/lib/wallet/mera";
import { AUSD } from "@/lib/monad";
import { qty, usd } from "@/lib/fmt";
import { TxLink } from "./TxLink";

const GAS_KEEP = 0.02; // MON kept back so the send itself can pay gas

export function SendFunds() {
  const mera = useMera();
  const [token, setToken] = useState<"AUSD" | "MON">("AUSD");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ hash: string; text: string }[]>([]);
  const b = mera.balances;
  const have = token === "AUSD" ? (b?.ausd ?? 0) : Math.max(0, (b?.mon ?? 0) - GAS_KEEP);
  const n = Number(amt);
  const okTo = isAddress(to.trim());

  async function send() {
    if (!mera.wallet || !okTo || !(n > 0)) return;
    if (n > have + 1e-9) return setErr(token === "AUSD" ? "More than your AUSD." : `More than your MON (${GAS_KEEP} is kept for gas).`);
    if (to.trim().toLowerCase() === mera.address?.toLowerCase()) return setErr("That's this wallet's own address.");
    setBusy(true);
    setErr("");
    try {
      const dest = to.trim() as `0x${string}`;
      let hash: `0x${string}`;
      if (token === "AUSD") {
        const args = [dest, parseUnits(amt, AUSD.decimals)] as const;
        const gas = await publicClient.estimateContractGas({ address: AUSD.address, abi: erc20Abi, functionName: "transfer", args, account: mera.wallet.account });
        hash = await mera.wallet.writeContract({ address: AUSD.address, abi: erc20Abi, functionName: "transfer", args, gas: (gas * 13n) / 10n });
      } else {
        hash = await mera.wallet.sendTransaction({ to: dest, value: parseUnits(amt, 18), gas: 21_000n });
      }
      const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (rc.status !== "success") throw new Error("transfer reverted");
      setSent((s) => [{ hash, text: `Sent ${token === "AUSD" ? usd(n) + " AUSD" : qty(n, 4) + " MON"} to ${dest.slice(0, 6)}…${dest.slice(-4)}` }, ...s]);
      setAmt("");
      await mera.refresh();
    } catch (e) {
      const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
      setErr(m.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="label">Send out of this wallet</span>
        <span className="label">to any Monad address</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 border-2 border-steel p-1">
        {(["AUSD", "MON"] as const).map((t) => (
          <button key={t} onClick={() => setToken(t)} className={`btn !py-2 ${token === t ? "btn-primary" : "text-mute"}`}>
            {t}
          </button>
        ))}
      </div>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="0x… destination address"
        spellCheck={false}
        autoComplete="off"
        className="num mt-3 w-full border-2 border-steel bg-ink-3 px-3 py-3 text-[14px] outline-none focus:border-[var(--papaya)]"
        aria-label="Destination address"
      />
      {to && !okTo && <p className="mt-1 text-xs text-pink">That isn&apos;t a valid address.</p>}
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <input
            inputMode="decimal"
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            className="num w-full border-2 border-steel bg-ink-3 px-3 py-3 text-lg outline-none focus:border-[var(--papaya)]"
            aria-label="Amount"
          />
          <span className="label absolute right-3 top-1/2 -translate-y-1/2">{token}</span>
        </div>
        <button className="btn btn-ghost !px-3" onClick={() => setAmt(token === "AUSD" ? String(Math.floor(have * 1e6) / 1e6) : have.toFixed(4))}>
          Max
        </button>
      </div>
      <p className="mt-1 text-[11px] text-mute">
        available {token === "AUSD" ? `${usd(have)} AUSD` : `${qty(have, 4)} MON (keeps ${GAS_KEEP} for gas)`}. Double-check the address: transfers can&apos;t be undone.
      </p>
      {err && <p className="mt-2 text-sm text-pink">{err}</p>}
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !okTo || !(n > 0)} onClick={() => void send()}>
        {busy ? "Sending on Monad…" : `Send ${token}`}
      </button>
      {sent.length > 0 && (
        <div className="mt-3 space-y-1">
          {sent.map((x) => (
            <div key={x.hash} className="flex justify-between gap-2 text-xs">
              <span className="text-lavender">{x.text}</span>
              <TxLink hash={x.hash} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
