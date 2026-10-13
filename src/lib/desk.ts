/**
 * The Monad basis desk · hold MON spot on Kuru, short the same MON on Perpl.
 *
 * The two legs cancel each other's price moves (delta-neutral), so what's left
 * is funding: when Perpl's funding is positive, longs pay shorts every
 * interval, and the short leg collects it. Everything here runs from the
 * rider's passkey wallet: the spot leg is a Kuru swap, the perp leg an
 * Exchange.execOrder, both their own Monad txs.
 *
 *   open   AUSD → MON on Kuru, then short exactly that MON on Perpl (2×)
 *   close  buy back the short on Perpl, then MON → AUSD on Kuru
 */
import type { PublicClient } from "viem";
import { quote, swap, type KuruQuote } from "./kuru";
import { execIoc, readPosition, ONCHAIN } from "./perpl/onchain";
import type { PerplMarket } from "./perpl/config";

type Wallet = Parameters<typeof swap>[1];

export const DESK_LEVERAGE = 2; // the short leg: ~50% to liquidation, wide on purpose
const SLIP = 0.004;

/** Funding carry in plain numbers. `rateMicros` is Perpl's per-interval rate (10⁻⁶). */
export function carry(rateMicros: number, intervalSec: number) {
  const perInterval = rateMicros / 1e4; // percent
  const perDay = perInterval * (86_400 / Math.max(60, intervalSec));
  return {
    perIntervalPct: perInterval,
    perDayPct: perDay,
    aprPct: perDay * 365,
    shortsEarn: rateMicros > 0,
    per100PerDay: perDay, // $ per day on $100, since perDay is a percent
  };
}

export interface DeskPosition {
  openedAt: number;
  asset: "MON";
  usdIn: number;
  mon: number; // spot MON bought on Kuru
  perpSize: number; // MON shorted on Perpl
  perpEntry: number;
  spotPrice: number; // AUSD per MON paid
  txs: { label: string; hash: string }[];
}

const KEY = (owner: string) => `rtn-monad-desk-${owner.toLowerCase()}`;
export const loadDesk = (owner: string): DeskPosition | null => {
  try {
    const r = localStorage.getItem(KEY(owner));
    return r ? (JSON.parse(r) as DeskPosition) : null;
  } catch {
    return null;
  }
};
const saveDesk = (owner: string, d: DeskPosition | null) => {
  try {
    if (d) localStorage.setItem(KEY(owner), JSON.stringify(d));
    else localStorage.removeItem(KEY(owner));
  } catch {}
};

/** What a full round trip costs (Kuru both ways + Perpl taker both ways), in percent. */
export async function roundTripCostPct(user: `0x${string}`, usd: number, perplTakerBps: number): Promise<number> {
  const buy = await quote(user, "AUSD", "MON", usd);
  const back = await quote(user, "MON", "AUSD", Math.floor(buy.out * 1000) / 1000);
  const kuruPct = ((usd - back.out) / usd) * 100;
  return Math.max(0, kuruPct) + (2 * perplTakerBps) / 100;
}

export async function openDesk(opts: {
  pc: PublicClient;
  w: Wallet;
  market: PerplMarket;
  accountId: bigint;
  usd: number;
  onStep: (s: string) => void;
}): Promise<DeskPosition> {
  const { pc, w, market, accountId, usd, onStep } = opts;
  const owner = w.account.address;
  const txs: { label: string; hash: string }[] = [];

  // leg 1 · spot on Kuru
  onStep("Leg 1 of 2 · quoting MON on Kuru…");
  const q: KuruQuote = await quote(owner, "AUSD", "MON", usd);
  const before = await pc.getBalance({ address: owner });
  const s = await swap(pc, w, q, (t) => onStep(`Leg 1 of 2 · ${t.replace(/^Step \d of \d · /, "")}`));
  if (s.approveHash) txs.push({ label: "Approve AUSD (Kuru)", hash: s.approveHash });
  txs.push({ label: "Buy MON spot (Kuru)", hash: s.hash });
  const after = await pc.getBalance({ address: owner });
  // MON received, net of the gas this leg spent (so the short matches what we hold)
  const received = Math.max(q.minOut, Number(after - before) / 1e18);
  const mon = Math.floor(received); // Perpl's MON market trades whole MON

  // leg 2 · the matching short on Perpl
  onStep(`Leg 2 of 2 · shorting ${mon} MON on Perpl…`);
  const touch = market.mid || usd / q.out;
  const tx = await execIoc(pc, w, market, ONCHAIN.OPEN_SHORT, mon, touch * (1 - SLIP), DESK_LEVERAGE);
  txs.push({ label: `Short ${mon} MON (Perpl)`, hash: tx.hash });
  const pos = await readPosition(pc, market, accountId);
  if (pos.side !== -1) throw new Error("The Perpl short didn't fill. The MON you bought is in your wallet; sell it on Spot or try the short again.");

  const d: DeskPosition = { openedAt: Date.now(), asset: "MON", usdIn: usd, mon: received, perpSize: pos.size, perpEntry: pos.entry, spotPrice: usd / received, txs };
  saveDesk(owner, d);
  return d;
}

export async function closeDesk(opts: {
  pc: PublicClient;
  w: Wallet;
  market: PerplMarket;
  accountId: bigint;
  desk: DeskPosition;
  onStep: (s: string) => void;
}): Promise<{ txs: { label: string; hash: string }[]; ausdOut: number }> {
  const { pc, w, market, accountId, desk, onStep } = opts;
  const owner = w.account.address;
  const txs: { label: string; hash: string }[] = [];

  // leg 1 · close the short first, so we're never naked short
  const pos = await readPosition(pc, market, accountId);
  if (pos.side === -1 && pos.size > 0) {
    onStep(`Leg 1 of 2 · buying back ${pos.size} MON on Perpl…`);
    const mid = market.mid || pos.mark;
    const tx = await execIoc(pc, w, market, ONCHAIN.CLOSE_SHORT, pos.size, mid * (1 + SLIP), DESK_LEVERAGE);
    txs.push({ label: "Close short (Perpl)", hash: tx.hash });
  }

  // leg 2 · sell the spot MON back to AUSD, keeping a little MON for gas
  const bal = Number(await pc.getBalance({ address: owner })) / 1e18;
  const sell = Math.floor(Math.min(desk.mon, Math.max(0, bal - 0.1)) * 1000) / 1000;
  let ausdOut = 0;
  if (sell > 0) {
    onStep(`Leg 2 of 2 · selling ${sell} MON on Kuru…`);
    const q = await quote(owner, "MON", "AUSD", sell);
    const s = await swap(pc, w, q, () => {});
    txs.push({ label: "Sell MON spot (Kuru)", hash: s.hash });
    ausdOut = q.out;
  }
  saveDesk(owner, null);
  return { txs, ausdOut };
}
