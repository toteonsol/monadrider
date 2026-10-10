/**
 * Perpl, direct onchain · the passkey account talks to Perpl's Exchange
 * contract on Monad itself, no API key and no forwarding.
 *
 *   createAccount / depositCollateral   AUSD from the wallet into Perpl margin
 *   withdrawCollateral                  margin back to the wallet
 *   execOrder (IOC)                     a carve: one Monad tx per order
 *
 * Every order is the user's own transaction, signed in-tab by the Mera key, so
 * every carve on the receipt links to a real Monad tx. Fills are read back from
 * contract state after the receipt (position + account balance), which is exact
 * and needs no event decoding.
 *
 * ABI fragments from PerplFoundation/dex-sdk (abi/dex/Exchange.json).
 */
import { erc20Abi, type Account, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import { AUSD, PERPL_EXCHANGE } from "@/lib/monad";
import type { PerplMarket } from "./config";

const orderDesc = {
  name: "orderDesc",
  type: "tuple",
  components: [
    { name: "orderDescId", type: "uint256" },
    { name: "perpId", type: "uint256" },
    { name: "orderType", type: "uint8" },
    { name: "orderId", type: "uint256" },
    { name: "pricePNS", type: "uint256" },
    { name: "lotLNS", type: "uint256" },
    { name: "expiryBlock", type: "uint256" },
    { name: "postOnly", type: "bool" },
    { name: "fillOrKill", type: "bool" },
    { name: "immediateOrCancel", type: "bool" },
    { name: "maxMatches", type: "uint256" },
    { name: "leverageHdths", type: "uint256" },
    { name: "lastExecutionBlock", type: "uint256" },
    { name: "amountCNS", type: "uint256" },
    { name: "maxNegPnlCollatBPS", type: "uint256" },
  ],
} as const;

export const exchangeAbi = [
  { type: "function", name: "createAccount", stateMutability: "nonpayable", inputs: [{ name: "amountCNS", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "depositCollateral", stateMutability: "nonpayable", inputs: [{ name: "amountCNS", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdrawCollateral", stateMutability: "nonpayable", inputs: [{ name: "amountCNS", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "execOrder",
    stateMutability: "nonpayable",
    inputs: [orderDesc],
    outputs: [{ name: "signature", type: "tuple", components: [{ name: "perpId", type: "uint256" }, { name: "orderId", type: "uint256" }] }],
  },
  {
    type: "function",
    name: "getAccountByAddr",
    stateMutability: "view",
    inputs: [{ name: "accountAddress", type: "address" }],
    outputs: [
      {
        name: "accountInfo",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "balanceCNS", type: "uint256" },
          { name: "lockedBalanceCNS", type: "uint256" },
          { name: "frozen", type: "uint8" },
          { name: "accountAddr", type: "address" },
          {
            name: "positions",
            type: "tuple",
            components: [
              { name: "bank1", type: "uint256" },
              { name: "bank2", type: "uint256" },
              { name: "bank3", type: "uint256" },
              { name: "bank4", type: "uint256" },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [
      { name: "perpId", type: "uint256" },
      { name: "accountId", type: "uint256" },
    ],
    outputs: [
      {
        name: "positionInfo",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "nextNodeId", type: "uint256" },
          { name: "prevNodeId", type: "uint256" },
          { name: "positionType", type: "uint8" },
          { name: "depositCNS", type: "uint256" },
          { name: "pricePNS", type: "uint256" },
          { name: "lotLNS", type: "uint256" },
          { name: "entryBlock", type: "uint256" },
          { name: "pnlCNS", type: "int256" },
          { name: "deltaPnlCNS", type: "int256" },
          { name: "premiumPnlCNS", type: "int256" },
        ],
      },
      { name: "markPricePNS", type: "uint256" },
      { name: "markPriceValid", type: "bool" },
    ],
  },
] as const;

/** Onchain order types (0-based, unlike the API's 1-based `t`). */
export const ONCHAIN = { OPEN_LONG: 0, OPEN_SHORT: 1, CLOSE_LONG: 2, CLOSE_SHORT: 3 } as const;

type W = WalletClient<Transport, Chain, Account>;

const CNS = 10 ** AUSD.decimals;
export const toCns = (usd: number) => BigInt(Math.floor(usd * CNS));
export const fromCns = (x: bigint) => Number(x) / CNS;

export interface PerplAccount {
  id: bigint;
  free: number;
  locked: number;
}

export async function readAccount(pc: PublicClient, owner: `0x${string}`): Promise<PerplAccount | null> {
  try {
    const a = await pc.readContract({ address: PERPL_EXCHANGE, abi: exchangeAbi, functionName: "getAccountByAddr", args: [owner] });
    if (!a.accountId) return null;
    return { id: a.accountId, free: fromCns(a.balanceCNS), locked: fromCns(a.lockedBalanceCNS) };
  } catch {
    // reverts when the address has no Perpl account
    return null;
  }
}

export interface PerplPosition {
  side: 1 | -1 | 0;
  size: number;
  entry: number;
  deposit: number;
  pnl: number;
  mark: number;
}

export async function readPosition(pc: PublicClient, m: PerplMarket, accountId: bigint): Promise<PerplPosition> {
  const [p, mark] = await pc.readContract({
    address: PERPL_EXCHANGE,
    abi: exchangeAbi,
    functionName: "getPosition",
    args: [BigInt(m.id), accountId],
  });
  const size = Number(p.lotLNS) / 10 ** m.sizeDecimals;
  // PositionEnum: 0 = Long, 1 = Short (an empty slot reads as zero size)
  const side: 1 | -1 | 0 = size === 0 ? 0 : p.positionType === 1 ? -1 : 1;
  return {
    side,
    size,
    entry: Number(p.pricePNS) / 10 ** m.priceDecimals,
    deposit: fromCns(p.depositCNS),
    pnl: Number(p.pnlCNS) / CNS,
    mark: Number(mark) / 10 ** m.priceDecimals,
  };
}

/** Send a contract write with an explicit gas limit. Monad bills the declared
 *  limit, not the gas used, so estimate and add a modest buffer. */
async function send(pc: PublicClient, w: W, req: Parameters<W["writeContract"]>[0]) {
  const gas = await pc.estimateContractGas({ ...(req as object), account: w.account } as Parameters<PublicClient["estimateContractGas"]>[0]);
  const hash = await w.writeContract({ ...(req as object), gas: (gas * 12n) / 10n } as Parameters<W["writeContract"]>[0]);
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (receipt.status !== "success") throw Object.assign(new Error("transaction reverted"), { hash });
  return { hash, block: Number(receipt.blockNumber) };
}

async function ensureAllowance(pc: PublicClient, w: W, amount: bigint) {
  const owner = w.account.address;
  const have = await pc.readContract({ address: AUSD.address, abi: erc20Abi, functionName: "allowance", args: [owner, PERPL_EXCHANGE] });
  if (have >= amount) return null;
  return send(pc, w, { address: AUSD.address, abi: erc20Abi, functionName: "approve", args: [PERPL_EXCHANGE, amount] } as never);
}

/** Move AUSD from the wallet into Perpl margin, opening the account on first use. */
export async function depositAusd(pc: PublicClient, w: W, usd: number) {
  const amount = toCns(usd);
  const approve = await ensureAllowance(pc, w, amount);
  const acct = await readAccount(pc, w.account.address);
  const tx = await send(pc, w, {
    address: PERPL_EXCHANGE,
    abi: exchangeAbi,
    functionName: acct ? "depositCollateral" : "createAccount",
    args: [amount],
  } as never);
  return { approve, tx, created: !acct };
}

export async function withdrawAusd(pc: PublicClient, w: W, usd: number) {
  return send(pc, w, { address: PERPL_EXCHANGE, abi: exchangeAbi, functionName: "withdrawCollateral", args: [toCns(usd)] } as never);
}

/** One IOC order straight to the Exchange. `limitPx` is the worst price accepted. */
export async function execIoc(
  pc: PublicClient,
  w: W,
  m: PerplMarket,
  type: number,
  size: number,
  limitPx: number,
  leverageX = 3,
) {
  const lot = BigInt(Math.max(1, Math.round(size * 10 ** m.sizeDecimals)));
  const price = BigInt(Math.max(1, Math.round(limitPx * 10 ** m.priceDecimals)));
  return send(pc, w, {
    address: PERPL_EXCHANGE,
    abi: exchangeAbi,
    functionName: "execOrder",
    args: [
      {
        orderDescId: BigInt(Date.now()),
        perpId: BigInt(m.id),
        orderType: type,
        orderId: 0n,
        pricePNS: price,
        lotLNS: lot,
        expiryBlock: 0n,
        postOnly: false,
        fillOrKill: false,
        immediateOrCancel: true,
        maxMatches: 1000n,
        leverageHdths: BigInt(Math.round(leverageX * 100)),
        lastExecutionBlock: 0n,
        amountCNS: 0n,
        maxNegPnlCollatBPS: 1000n,
      },
    ],
  } as never);
}
