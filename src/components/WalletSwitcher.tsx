"use client";
/**
 * Your passkey wallets · one per purpose (spend, save, desk…). Each is its own
 * Monad address from its own passkey; switching locks one and opens the other
 * with a Face ID / fingerprint check. Only public ids and labels are stored.
 */
import { useState } from "react";
import { useMera } from "@/lib/wallet/mera";

export function WalletSwitcher() {
  const mera = useMera();
  const [naming, setNaming] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  if (mera.wallets.length === 0) return null;

  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="label">Your passkey wallets</span>
        <span className="label">{mera.wallets.length} on this device</span>
      </div>
      <ul className="mt-3 space-y-2">
        {mera.wallets.map((w) => {
          const on = w.credentialId === mera.activeId;
          return (
            <li key={w.credentialId} className={`flex items-center gap-3 border-2 px-3 py-2.5 ${on ? "border-papaya bg-papaya/10" : "border-steel"}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-chart" : "bg-steel"}`} />
              <div className="min-w-0 flex-1">
                {naming === w.credentialId ? (
                  <input
                    autoFocus
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={() => {
                      mera.rename(w.credentialId, label);
                      setNaming(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full border border-steel bg-ink px-2 py-1 text-[14px] text-bone outline-none"
                    maxLength={24}
                  />
                ) : (
                  <button className="display text-left text-[13px] font-bold text-bone hover:text-papaya" onClick={() => (setNaming(w.credentialId), setLabel(w.label))} title="rename">
                    {w.label}
                  </button>
                )}
                <div className="num truncate text-[11px] text-mute">{w.address ? `${w.address.slice(0, 8)}…${w.address.slice(-6)}` : "opens on first login"}</div>
              </div>
              {on ? (
                <span className="display text-[10px] font-black uppercase text-chart">open</span>
              ) : (
                <button className="btn btn-ghost !px-3 !py-1.5 !text-[10.5px]" disabled={mera.busy} onClick={() => void mera.switchTo(w.credentialId)}>
                  switch
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="mt-3 flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name, e.g. Savings" maxLength={24} className="flex-1 border-2 border-steel bg-ink-3 px-3 py-2 text-[14px] outline-none focus:border-[var(--papaya)]" />
          <button
            className="btn btn-primary !py-2"
            disabled={mera.busy}
            onClick={async () => {
              mera.lock();
              await mera.create(newName);
              setAdding(false);
              setNewName("");
            }}
          >
            {mera.busy ? "passkey…" : "create"}
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost mt-3 w-full !py-2" onClick={() => setAdding(true)}>
          + new passkey wallet
        </button>
      )}
      <p className="mt-2 text-[11px] leading-snug text-mute">
        Each wallet is a separate Monad address made by its own passkey. Use one to ride, one to save, one for the desk. Only labels and
        public ids are kept here; the passkeys stay in your password manager.
      </p>
    </section>
  );
}
