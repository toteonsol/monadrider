/**
 * Ride receipts · what happened, in numbers, with the Monad tx behind every
 * fill. Kept in this browser (per wallet) so a rider can show their history;
 * the chain is the real record, and every live fill links to it.
 */
import type { Fill, Rails, RideState } from "./engine";

export interface Receipt {
  id: string;
  asset: string;
  mode: "practice" | "live";
  autopilot: boolean;
  owner: string | null;
  startedAt: number;
  endedAt: number;
  endReason: string;
  net: number;
  realized: number;
  fees: number;
  volume: number;
  trades: number;
  wins: number;
  wipeouts: number;
  maxDrawdown: number;
  rails: Rails;
  fills: Fill[];
}

const KEY = (owner: string | null) => `rtn-monad-receipts-${(owner ?? "practice").toLowerCase()}`;

export function buildReceipt(
  s: RideState,
  meta: { asset: string; mode: "practice" | "live"; autopilot: boolean; rails: Rails; owner: string | null },
): Receipt {
  const closes = s.fills.filter((f) => f.action === "close");
  return {
    id: `${s.startedAt}-${Math.random().toString(36).slice(2, 7)}`,
    asset: meta.asset,
    mode: meta.mode,
    autopilot: meta.autopilot,
    owner: meta.owner,
    startedAt: s.startedAt,
    endedAt: s.endedAt || Date.now(),
    endReason: s.endReason,
    net: s.realized - s.fees,
    realized: s.realized,
    fees: s.fees,
    volume: s.volume,
    trades: closes.length,
    wins: closes.filter((f) => (f.pnl ?? 0) > 0).length,
    wipeouts: s.wipeouts,
    maxDrawdown: s.maxDrawdown,
    rails: meta.rails,
    fills: s.fills,
  };
}

export function saveReceipt(
  s: RideState,
  meta: { asset: string; mode: "practice" | "live"; autopilot: boolean; rails: Rails; owner: string | null; lastMid: number },
): Receipt {
  const r = buildReceipt(s, meta);
  try {
    const list = loadReceipts(meta.owner);
    localStorage.setItem(KEY(meta.owner), JSON.stringify([r, ...list].slice(0, 50)));
  } catch {
    /* storage blocked: the receipt still shows for this ride */
  }
  return r;
}

export function loadReceipts(owner: string | null): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY(owner));
    return raw ? (JSON.parse(raw) as Receipt[]) : [];
  } catch {
    return [];
  }
}
