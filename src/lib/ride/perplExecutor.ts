/**
 * Live executor · real IOC market orders on Perpl, Monad mainnet.
 *
 * Orders go over Perpl's trading socket, signed in the browser by the user's
 * trade-only Ed25519 key. Perpl forwards each one onchain (one-click trading),
 * and the order update that settles it carries the Monad tx hash, which lands
 * on the ride receipt.
 */
import type { ExecResult, Executor } from "./engine";
import type { PerplKey } from "@/lib/perpl/agent";
import { getPerplWs, type PerplWs } from "@/lib/perpl/wsClient";

/** Plain words for the Perpl refusals a rider is likely to meet. */
const REASONS: Record<number, string> = {
  34: "One-click trading is off for this Perpl account. Turn it on in Money.",
};

function explain(err: string | undefined): string {
  const m = /reason (\d+)/.exec(err ?? "");
  if (m && REASONS[Number(m[1])]) return REASONS[Number(m[1])];
  return err ?? "order refused";
}

export class PerplExecutor implements Executor {
  readonly kind = "perpl" as const;
  readonly ws: PerplWs;

  constructor(
    key: PerplKey,
    private asset: string,
  ) {
    this.ws = getPerplWs(key);
  }

  ready() {
    return this.ws.ensureReady();
  }

  async open(side: 1 | -1, usd: number): Promise<ExecResult> {
    const r = await this.ws.openMarket(this.asset, side > 0, usd);
    if (r.status !== "filled") return { ok: false, error: explain(r.error) };
    return {
      ok: true,
      px: r.avgPx ? Number(r.avgPx) : undefined,
      size: Number(r.filledSz),
      fee: r.fee,
      txid: r.txid,
      block: r.block,
    };
  }

  async close(): Promise<ExecResult> {
    const r = await this.ws.close(this.asset);
    if (r.status !== "filled") {
      // already flat on the venue is a successful close from the ride's view
      if (r.error === "no open position") return { ok: true, size: 0, fee: 0 };
      return { ok: false, error: explain(r.error) };
    }
    return {
      ok: true,
      px: r.avgPx ? Number(r.avgPx) : undefined,
      size: Number(r.filledSz),
      fee: r.fee,
      txid: r.txid,
      block: r.block,
    };
  }
}
