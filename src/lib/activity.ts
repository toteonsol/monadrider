"use client";
/**
 * The logbook's ledger · every thing a rider does with money, in one place:
 * live rides (passkey wallet or Perpl API key), practice runs, Kuru swaps,
 * Perpl deposits and withdrawals, and sends. Each entry carries its Monad txs.
 * Kept in this browser (newest first); the chain is the real record and every
 * entry links to it.
 */
import type { Receipt } from "./ride/receipts";

export type Route = "passkey" | "apikey" | "practice";

export type Activity =
  | { kind: "ride"; id: string; at: number; route: Route; receipt: Receipt; verified?: boolean }
  | { kind: "swap"; id: string; at: number; route: "passkey"; title: string; side: "buy" | "sell"; amountIn: number; out: number; txs: { label: string; hash: string }[] }
  | { kind: "deposit" | "withdraw"; id: string; at: number; route: "passkey"; amount: number; created?: boolean; txs: { label: string; hash: string }[] }
  | { kind: "send"; id: string; at: number; route: "passkey"; token: "AUSD" | "MON"; amount: number; to: string; txs: { label: string; hash: string }[] };

const KEY = "rtn-monad-activity";

export function loadActivity(): (Activity & WithOwner)[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as (Activity & WithOwner)[]) : [];
  } catch {
    return [];
  }
}

/** Every entry may carry the wallet it belongs to (passkey address or Perpl key owner). */
type WithOwner = { owner?: string | null };

/** Distributive omit, so each kind keeps its own fields. */
type NewActivity = Activity extends infer A ? (A extends Activity ? Omit<A, "id" | "at"> : never) : never;

export function logActivity(a: NewActivity & WithOwner) {
  const full = { ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() } as Activity;
  try {
    localStorage.setItem(KEY, JSON.stringify([full, ...loadActivity()].slice(0, 200)));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rtn-activity"));
}
