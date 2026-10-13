"use client";
/**
 * "Use my existing Perpl account" · trade an account you already have on
 * perpl.xyz with a trade-only API key, no transfers.
 *
 * The rider creates a key on app.perpl.xyz/apikeys and pastes the key and its
 * secret here once. The secret stays in this browser (localStorage) and only
 * ever signs Perpl's socket sign-in; it never leaves the device. A Perpl API
 * key cannot withdraw or transfer funds, whatever its scope. Orders are
 * forwarded onchain by Perpl (one-click trading), so no MON for gas is needed.
 */
import { useCallback, useEffect, useState } from "react";
import { loadPerplKey, savePerplKey, clearPerplKey, type PerplKey } from "./agent";
import { getPerplWs, dropPerplWs } from "./wsClient";

const SLOT = "rtn-monad-perpl-apikey"; // which saved key this browser rides with

export interface ApiKeyAccount {
  key: PerplKey | null;
  owner: string | null;
  accountId: number;
  free: number;
  locked: number;
  /** one-click trading (order forwarding) · null = not reported yet */
  forwarding: boolean | null;
  status: "none" | "connecting" | "ready" | "error";
  error: string;
  connect: (apiKey: string, secret: string) => Promise<void>;
  disconnect: () => void;
}

export function useApiKeyAccount(): ApiKeyAccount {
  const [key, setKey] = useState<PerplKey | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [acct, setAcct] = useState({ accountId: 0, free: 0, locked: 0, forwarding: null as boolean | null });
  const [status, setStatus] = useState<ApiKeyAccount["status"]>("none");
  const [error, setError] = useState("");

  const open = useCallback(async (k: PerplKey) => {
    setStatus("connecting");
    setError("");
    const ws = getPerplWs(k);
    try {
      await ws.ensureReady();
      const a = ws.account();
      if (!a.accountId) throw new Error("This key's wallet has no Perpl account yet. Deposit on perpl.xyz first.");
      const addr = ws.walletAddress() ?? "perpl";
      setKey(k);
      setOwner(addr);
      setAcct(a);
      setStatus("ready");
      return addr;
    } catch (e) {
      dropPerplWs(k.apiKey);
      setKey(null);
      setStatus("error");
      const m = e instanceof Error ? e.message : String(e);
      const detail = m.replace(/^Perpl WS /, "");
      if (/code 3401/.test(m)) {
        setError(
          "Perpl says unauthorized (3401): the API key and the secret don't belong together, or the key was revoked or has expired. The first box needs the API key itself (not the public key), the second box the hex private key from the same key.",
        );
        return null;
      }
      if (/code 3403/.test(m)) {
        setError("Perpl says this key isn't allowed to trade (3403). Create a new key with the trade scope.");
        return null;
      }
      setError(
        /closed before auth|timed out/.test(m)
          ? `Perpl refused this sign-in. Most often the first box holds the public key instead of the API key, or the key is read-only. (Perpl said: ${detail})`
          : m,
      );
      return null;
    }
  }, []);

  // reconnect a key saved earlier in this browser
  useEffect(() => {
    try {
      const slot = localStorage.getItem(SLOT);
      const k = slot ? loadPerplKey(slot) : null;
      if (k) void open(k);
    } catch {}
  }, [open]);

  // keep the margin numbers fresh from the socket
  useEffect(() => {
    if (!key || status !== "ready") return;
    const t = setInterval(() => setAcct(getPerplWs(key).account()), 3000);
    return () => clearInterval(t);
  }, [key, status]);

  const connect = useCallback(
    async (apiKey: string, secret: string) => {
      const k = { apiKey: apiKey.trim(), privateKey: secret.trim().replace(/^0x/, "") };
      if (!k.apiKey || !/^[0-9a-fA-F]{64}$/.test(k.privateKey)) {
        setStatus("error");
        setError("The secret should be the 64-character hex private key Perpl showed when you created the key.");
        return;
      }
      const addr = await open(k);
      if (addr) {
        try {
          savePerplKey(addr, k);
          localStorage.setItem(SLOT, addr);
        } catch {}
      }
    },
    [open],
  );

  const disconnect = useCallback(() => {
    if (key) dropPerplWs(key.apiKey);
    try {
      const slot = localStorage.getItem(SLOT);
      if (slot) clearPerplKey(slot);
      localStorage.removeItem(SLOT);
    } catch {}
    setKey(null);
    setOwner(null);
    setStatus("none");
    setAcct({ accountId: 0, free: 0, locked: 0, forwarding: null });
  }, [key]);

  return { key, owner, ...acct, status, error, connect, disconnect };
}
