"use client";
/**
 * Mera passkey wallet · login with a passkey, trade from a Monad account.
 *
 * Mera (Category Labs) turns a passkey's WebAuthn PRF output into a BIP-39
 * seed and derives a standard Monad account from it (m/44'/60'/0'/0/0). The
 * same passkey always yields the same address, on any device the passkey syncs
 * to; nothing is stored server-side and there is no seed phrase to write down.
 *
 * The derived key lives only in this tab's memory for the session, so the game
 * can sign each carve without a prompt. "Lock" ends the session and zeroes it.
 * Only the credential id (public) is kept in localStorage, to skip the passkey
 * picker next time.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, isMeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type LocalAccount,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from "viem";
import { monad, AUSD } from "@/lib/monad";

const CRED_KEY = "rtn-monad-mera-credential";

export const publicClient = createPublicClient({ chain: monad, transport: http() }) as PublicClient;

function deriveEvmKey(prf: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prf, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("could not derive a key from this passkey");
  return node.privateKey;
}

function friendly(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey can't derive a wallet. Use iCloud Keychain (iPhone/Mac), Google Password Manager (Android) or 1Password.";
      case "PASSKEY_OPERATION_FAILED":
        return "Passkey cancelled or not available on this device.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser has no WebCrypto. Open the app over HTTPS.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

export interface Balances {
  mon: number;
  ausd: number;
  updatedAt: number;
}

interface WalletCtx {
  address: `0x${string}` | null;
  account: LocalAccount | null;
  wallet: WalletClient<Transport, Chain, Account> | null;
  balances: Balances | null;
  busy: boolean;
  error: string;
  hasPasskey: boolean;
  create: (name: string) => Promise<void>;
  login: () => Promise<void>;
  lock: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function MeraProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [session, setSession] = useState<{ end(): void } | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    try {
      setHasPasskey(!!localStorage.getItem(CRED_KEY));
    } catch {
      /* storage blocked: the picker still works */
    }
  }, []);

  const open = useCallback((prf: Uint8Array) => {
    const s = createSecp256k1SigningSession({ privateKey: deriveEvmKey(prf) });
    setSession(s);
    setAccount(toViemAccount(s));
  }, []);

  const create = useCallback(
    async (name: string) => {
      setBusy(true);
      setError("");
      try {
        const label = name.trim() || "Rider";
        const c = await createPasskeyWithPrfOutput({
          rp: { id: location.hostname, name: "Ride the Now · Monad" },
          user: { name: label, displayName: label },
        });
        try {
          localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: c.credentialId, transports: c.transports }));
        } catch {}
        setHasPasskey(true);
        open(c.prfOutput);
      } catch (e) {
        setError(friendly(e));
      } finally {
        setBusy(false);
      }
    },
    [open],
  );

  const login = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      let credential;
      try {
        const raw = localStorage.getItem(CRED_KEY);
        credential = raw ? JSON.parse(raw) : undefined;
      } catch {}
      const r = await getPasskeyPrfOutput({ rpId: location.hostname, credential });
      open(r.prfOutput);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [open]);

  const lock = useCallback(() => {
    session?.end();
    setSession(null);
    setAccount(null);
    setBalances(null);
  }, [session]);

  const wallet = useMemo(
    () => (account ? createWalletClient({ account, chain: monad, transport: http() }) : null),
    [account],
  );

  const refresh = useCallback(async () => {
    if (!account) return;
    const [mon, ausd] = await Promise.all([
      publicClient.getBalance({ address: account.address }),
      publicClient.readContract({ address: AUSD.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    ]);
    setBalances({ mon: Number(mon) / 1e18, ausd: Number(ausd) / 10 ** AUSD.decimals, updatedAt: Date.now() });
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [account, refresh]);

  // end the session when the tab goes away
  useEffect(() => {
    const bye = () => session?.end();
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [session]);

  const value: WalletCtx = {
    address: account?.address ?? null,
    account,
    wallet,
    balances,
    busy,
    error,
    hasPasskey,
    create,
    login,
    lock,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMera(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMera outside MeraProvider");
  return c;
}
