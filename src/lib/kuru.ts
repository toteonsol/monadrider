/**
 * Kuru spot · swaps through Kuru Flow, which routes across Kuru's onchain
 * order books on Monad (MON/AUSD, MON/USDC) and returns ready calldata.
 *
 *   1. generate-token   per-address bearer token (rate-limited ~1 req/s)
 *   2. quote            best route, minOut and the tx to send
 *   3. approve + send   the swap is the rider's own Monad transaction
 *
 * Docs: docs.kuru.io · docs.monad.xyz/guides/kuru-flow
 */
import { erc20Abi, parseUnits, type Account, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import { AUSD } from "@/lib/monad";

const API = "https://ws.kuru.io/api";
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/** Kuru's MON/AUSD order book (the market the spot lane trades). */
export const KURU_MON_AUSD = "0x131a2e70a5b31a517a74b8c567149bc294470da9" as const;

export const TOKENS = {
  MON: { address: NATIVE, decimals: 18, symbol: "MON" },
  AUSD: { address: AUSD.address, decimals: AUSD.decimals, symbol: "AUSD" },
} as const;
export type SpotToken = keyof typeof TOKENS;

export interface KuruQuote {
  out: number;
  minOut: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  tokenIn: SpotToken;
  tokenOut: SpotToken;
  amountIn: number;
  at: number;
}

const tokens = new Map<string, { token: string; exp: number }>();
let lastCall = 0;

async function pace() {
  // Flow allows ~1 request/second per token; space our calls out
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function bearer(user: string): Promise<string> {
  const hit = tokens.get(user);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  await pace();
  const r = await fetch(`${API}/generate-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_address: user }),
  });
  if (!r.ok) throw new Error(`Kuru token ${r.status}`);
  const d = (await r.json()) as { token: string; expires_at?: number | string };
  const exp = d.expires_at ? new Date(typeof d.expires_at === "number" ? d.expires_at * 1000 : d.expires_at).getTime() : Date.now() + 10 * 60_000;
  tokens.set(user, { token: d.token, exp: Number.isFinite(exp) ? exp : Date.now() + 10 * 60_000 });
  return d.token;
}

export async function quote(user: `0x${string}`, tokenIn: SpotToken, tokenOut: SpotToken, amountIn: number): Promise<KuruQuote> {
  const tIn = TOKENS[tokenIn];
  const tOut = TOKENS[tokenOut];
  const token = await bearer(user);
  await pace();
  const r = await fetch(`${API}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      userAddress: user,
      tokenIn: tIn.address,
      tokenOut: tOut.address,
      amount: parseUnits(amountIn.toFixed(tIn.decimals > 8 ? 8 : tIn.decimals), tIn.decimals).toString(),
      autoSlippage: true,
    }),
  });
  if (!r.ok) throw new Error(`Kuru quote ${r.status}`);
  const q = (await r.json()) as {
    status?: string;
    output?: string;
    minOut?: string;
    transaction?: { to: string; calldata: string; value?: string };
    message?: string;
  };
  if (!q.transaction?.to || !q.output) throw new Error(q.message || "Kuru found no route for this size");
  const scale = 10 ** tOut.decimals;
  const data = q.transaction.calldata.startsWith("0x") ? q.transaction.calldata : `0x${q.transaction.calldata}`;
  return {
    out: Number(q.output) / scale,
    minOut: Number(q.minOut ?? q.output) / scale,
    to: q.transaction.to as `0x${string}`,
    data: data as `0x${string}`,
    value: BigInt(q.transaction.value ?? 0),
    tokenIn,
    tokenOut,
    amountIn,
    at: Date.now(),
  };
}

type W = WalletClient<Transport, Chain, Account>;

/** Execute a quote: approve the Flow entrypoint for ERC-20 input, then swap. */
export async function swap(pc: PublicClient, w: W, q: KuruQuote, onStep?: (s: string) => void) {
  const tIn = TOKENS[q.tokenIn];
  const owner = w.account.address;
  let approveHash: `0x${string}` | undefined;
  if (tIn.address !== NATIVE) {
    const amount = parseUnits(q.amountIn.toFixed(tIn.decimals), tIn.decimals);
    const have = await pc.readContract({ address: tIn.address, abi: erc20Abi, functionName: "allowance", args: [owner, q.to] });
    if (have < amount) {
      onStep?.("Step 1 of 2 · approving AUSD for Kuru…");
      const gas = await pc.estimateContractGas({ address: tIn.address, abi: erc20Abi, functionName: "approve", args: [q.to, amount], account: w.account });
      approveHash = await w.writeContract({ address: tIn.address, abi: erc20Abi, functionName: "approve", args: [q.to, amount], gas: (gas * 12n) / 10n });
      await pc.waitForTransactionReceipt({ hash: approveHash });
    }
  }
  onStep?.(approveHash ? "Step 2 of 2 · swapping on Kuru's order book…" : "Swapping on Kuru's order book…");
  const gas = await pc.estimateGas({ account: w.account, to: q.to, data: q.data, value: q.value });
  const hash = await w.sendTransaction({ to: q.to, data: q.data, value: q.value, gas: (gas * 13n) / 10n });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (receipt.status !== "success") throw Object.assign(new Error("swap reverted"), { hash });
  return { hash, approveHash, block: Number(receipt.blockNumber) };
}
