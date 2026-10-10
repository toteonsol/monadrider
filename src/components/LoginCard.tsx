"use client";
import { useState } from "react";
import { useMera } from "@/lib/wallet/mera";

/** Passkey login. First time creates a passkey; after that it's one tap. */
export function LoginCard({ compact = false }: { compact?: boolean }) {
  const mera = useMera();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(!mera.hasPasskey);

  return (
    <section className={`card px-5 ${compact ? "py-4" : "py-6"}`}>
      <div className="label">Mera passkey wallet</div>
      <h2 className="font-display mt-1 text-2xl font-bold">{creating ? "Make your wallet with a passkey" : "Welcome back"}</h2>
      <p className="mt-1 text-sm text-lavender/80">
        Face ID or fingerprint, no seed phrase. Your passkey derives a Monad wallet that only you can open.
      </p>
      {creating ? (
        <div className="mt-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rider name (shown in your passkey manager)"
            className="w-full rounded-xl border border-line bg-ink-3 px-3 py-3 outline-none focus:border-monad"
            maxLength={32}
          />
          <button className="btn btn-primary glow w-full !py-4" disabled={mera.busy} onClick={() => void mera.create(name)}>
            {mera.busy ? "Waiting for passkey…" : "Create passkey wallet"}
          </button>
          <button className="label w-full py-2 hover:text-lavender" onClick={() => setCreating(false)}>
            I already have one
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <button className="btn btn-primary glow w-full !py-4" disabled={mera.busy} onClick={() => void mera.login()}>
            {mera.busy ? "Waiting for passkey…" : "Log in with passkey"}
          </button>
          <button className="label w-full py-2 hover:text-lavender" onClick={() => setCreating(true)}>
            Create a new passkey instead
          </button>
        </div>
      )}
      {mera.error && <p className="mt-2 text-sm text-pink">{mera.error}</p>}
    </section>
  );
}
