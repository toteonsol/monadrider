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
import { monad, AUSD, monadTransport } from "@/lib/monad";

const CRED_KEY = "rtn-monad-mera-credential"; // the one used last (kept for older installs)
const WALLETS_KEY = "rtn-monad-mera-wallets";

/** A passkey wallet this browser knows: its passkey's public credential id, a
 *  label, and (once opened) its address. Nothing secret is stored. */
export interface SavedWallet {
  credentialId: string;
  transports?: string[];
  label: string;
  address?: string;
  addedAt: number;
}

function readWallets(): SavedWallet[] {
  try {
    const list = JSON.parse(localStorage.getItem(WALLETS_KEY) || "[]") as SavedWallet[];
    if (list.length) return list;
    // migrate the single credential older versions kept
    const one = localStorage.getItem(CRED_KEY);
    if (one) {
      const c = JSON.parse(one) as { credentialId: string; transports?: string[] };
      return [{ ...c, label: "Wallet 1", addedAt: Date.now() }];
    }
  } catch {}
  return [];
}
function writeWallets(list: SavedWallet[]) {
  try {
    localStorage.setItem(WALLETS_KEY, JSON.stringify(list));
  } catch {}
}

export const publicClient = createPublicClient({ chain: monad, transport: monadTransport() }) as PublicClient;

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
  /** every passkey wallet this browser knows, and the one that's open */
  wallets: SavedWallet[];
  activeId: string | null;
  create: (name: string) => Promise<void>;
  /** log in · with an id, to that saved wallet; without, the last one used */
  login: (credentialId?: string) => Promise<void>;
  /** lock the open wallet and log in to another */
  switchTo: (credentialId: string) => Promise<void>;
  rename: (credentialId: string, label: string) => void;
  forget: (credentialId: string) => void;
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
  const [wallets, setWallets] = useState<SavedWallet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const list = readWallets();
    setWallets(list);
    setHasPasskey(list.length > 0);
  }, []);

  const save = useCallback((list: SavedWallet[]) => {
    writeWallets(list);
    setWallets(list);
    setHasPasskey(list.length > 0);
  }, []);

  const open = useCallback(
    (prf: Uint8Array, credentialId: string) => {
      const s = createSecp256k1SigningSession({ privateKey: deriveEvmKey(prf) });
      const acct = toViemAccount(s);
      setSession(s);
      setAccount(acct);
      setActiveId(credentialId);
      // remember which address this passkey opens (public), and that it's the last used
      const list = readWallets();
      const i = list.findIndex((w) => w.credentialId === credentialId);
      if (i >= 0) list[i] = { ...list[i], address: acct.address };
      else list.push({ credentialId, label: `Wallet ${list.length + 1}`, address: acct.address, addedAt: Date.now() });
      save(list);
      try {
        const w = list.find((x) => x.credentialId === credentialId);
        localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId, transports: w?.transports }));
      } catch {}
    },
    [save],
  );

  const create = useCallback(
    async (name: string) => {
      setBusy(true);
      setError("");
      try {
        const existing = readWallets();
        const label = name.trim() || `Wallet ${existing.length + 1}`;
        const c = await createPasskeyWithPrfOutput({
          rp: { id: location.hostname, name: "Monad Rider" },
          user: { name: label, displayName: label },
        });
        save([...existing, { credentialId: c.credentialId, transports: c.transports as string[] | undefined, label, addedAt: Date.now() }]);
        open(c.prfOutput, c.credentialId);
      } catch (e) {
        setError(friendly(e));
      } finally {
        setBusy(false);
      }
    },
    [open, save],
  );

  const login = useCallback(async (credentialId?: string) => {
    setBusy(true);
    setError("");
    try {
      let credential;
      try {
        if (credentialId) {
          const w = readWallets().find((x) => x.credentialId === credentialId);
          credential = w ? { credentialId: w.credentialId, transports: w.transports } : undefined;
        } else {
          const raw = localStorage.getItem(CRED_KEY);
          credential = raw ? JSON.parse(raw) : undefined;
        }
      } catch {}
      const r = await getPasskeyPrfOutput({ rpId: location.hostname, credential });
      open(r.prfOutput, r.credentialId);
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
    setActiveId(null);
  }, [session]);

  const switchTo = useCallback(
    async (credentialId: string) => {
      session?.end();
      setSession(null);
      setAccount(null);
      setBalances(null);
      await login(credentialId);
    },
    [session, login],
  );

  const rename = useCallback(
    (credentialId: string, label: string) => save(readWallets().map((w) => (w.credentialId === credentialId ? { ...w, label: label.slice(0, 24) || w.label } : w))),
    [save],
  );
  const forget = useCallback((credentialId: string) => save(readWallets().filter((w) => w.credentialId !== credentialId)), [save]);

  const wallet = useMemo(
    () => (account ? createWalletClient({ account, chain: monad, transport: monadTransport() }) : null),
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
    wallets,
    activeId,
    create,
    login,
    switchTo,
    rename,
    forget,
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
