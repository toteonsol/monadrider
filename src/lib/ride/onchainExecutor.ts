/**
 * Onchain executor · each carve is one execOrder transaction from the rider's
 * Mera passkey account to Perpl's Exchange on Monad.
 *
 * Fill price, size and fees come from contract state read right after the
 * receipt: the position's entry/lot for opens, and the change in account
 * equity (free + locked + position deposit) for fees and realised P&L. That is
 * the venue's own accounting, so the receipt can't drift from the chain.
 */
import type { PublicClient } from "viem";
import type { ExecResult, Executor } from "./engine";
import type { PerplMarket } from "@/lib/perpl/config";
import { ONCHAIN, execIoc, readAccount, readPosition } from "@/lib/perpl/onchain";
import type { useMera } from "@/lib/wallet/mera";

type Wallet = NonNullable<ReturnType<typeof useMera>["wallet"]>;

/** Worst price an IOC may fill at, as a fraction of mid. Generous enough to
 *  cross the spread on a thin book, tight enough to cap a bad fill. */
const SLIP = 0.004;

export class OnchainExecutor implements Executor {
  readonly kind = "perpl" as const;

  constructor(
    private pc: PublicClient,
    private w: Wallet,
    private m: PerplMarket,
    private accountId: bigint,
    private leverageX = 3,
  ) {}

  private async equity(): Promise<number> {
    const [a, p] = await Promise.all([
      readAccount(this.pc, this.w.account.address),
      readPosition(this.pc, this.m, this.accountId),
    ]);
    return (a ? a.free + a.locked : 0) + p.deposit;
  }

  async open(side: 1 | -1, usd: number, mid: number): Promise<ExecResult> {
    try {
      const before = await this.equity();
      const size = usd / mid;
      const limit = side > 0 ? mid * (1 + SLIP) : mid * (1 - SLIP);
      const tx = await execIoc(this.pc, this.w, this.m, side > 0 ? ONCHAIN.OPEN_LONG : ONCHAIN.OPEN_SHORT, size, limit, this.leverageX);
      const [pos, after] = await Promise.all([readPosition(this.pc, this.m, this.accountId), this.equity()]);
      if (pos.side !== side || pos.size === 0) {
        return { ok: false, error: "IOC found no liquidity inside the limit; nothing filled", txid: tx.hash };
      }
      return { ok: true, px: pos.entry, size: pos.size, fee: Math.max(0, before - after), txid: tx.hash, block: tx.block };
    } catch (e) {
      return { ok: false, error: short(e) };
    }
  }

  async close(mid: number): Promise<ExecResult> {
    try {
      const pos = await readPosition(this.pc, this.m, this.accountId);
      if (pos.side === 0) return { ok: true, size: 0, fee: 0, px: mid };
      const before = await this.equity();
      const limit = pos.side > 0 ? mid * (1 - SLIP) : mid * (1 + SLIP);
      const tx = await execIoc(this.pc, this.w, this.m, pos.side > 0 ? ONCHAIN.CLOSE_LONG : ONCHAIN.CLOSE_SHORT, pos.size, limit, this.leverageX);
      const [left, after] = await Promise.all([readPosition(this.pc, this.m, this.accountId), this.equity()]);
      if (left.side !== 0 && left.size >= pos.size) {
        return { ok: false, error: "close found no liquidity inside the limit", txid: tx.hash };
      }
      // equity change on a close = price P&L − fee; report it as the net so the
      // receipt matches the account to the cent
      const net = after - before;
      return { ok: true, px: mid, size: pos.size - left.size, fee: 0, netPnl: net, txid: tx.hash, block: tx.block };
    } catch (e) {
      return { ok: false, error: short(e) };
    }
  }
}

function short(e: unknown): string {
  const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
  if (/insufficient funds/i.test(m)) return "Not enough MON for gas. Top up MON in Money.";
  return m.split("\n")[0].slice(0, 160);
}
