/**
 * Proves the direct-onchain Perpl path without spending anything.
 *
 * Finds a real Perpl account on Monad mainnet (the newest AccountCreated
 * event), then simulates from that wallet: open a small MON long with
 * Exchange.execOrder (IOC) → read the position → close it → read again.
 * eth_simulateV1 runs it against live state; nothing is broadcast.
 *
 *   pnpm verify:onchain
 */
import { createPublicClient, http, encodeFunctionData, decodeFunctionResult, parseAbiItem } from "viem";
import { monad } from "viem/chains";
import { exchangeAbi, ONCHAIN } from "../src/lib/perpl/onchain";

const EX = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F" as const;
const pc = createPublicClient({ chain: monad, transport: http(process.env.MONAD_RPC || "https://rpc.monad.xyz") });

const ctx = await (await fetch("https://app.perpl.xyz/api/v1/pub/context")).json();
const mon = ctx.markets.find((m: { name: string }) => m.name === "MON");
const pd = mon.config.price_decimals as number;
const mid = Number(mon.state.mid) / 10 ** pd;
console.log(`MON-PERP mid ${mid} (market ${mon.id})`);

// newest account owner with free collateral
const ev = parseAbiItem("event AccountCreated(address account, uint256 id)");
let owner: `0x${string}` | null = null;
let accountId = 0n;
let to = await pc.getBlockNumber();
for (let i = 0; i < 400 && !owner; i++) {
  const logs = await pc.getLogs({ address: EX, event: ev, fromBlock: to - 99n, toBlock: to });
  for (const l of logs.reverse()) {
    const a = await pc.readContract({ address: EX, abi: exchangeAbi, functionName: "getAccountByAddr", args: [l.args.account!] });
    if (Number(a.balanceCNS) / 1e6 > 3) {
      owner = l.args.account!;
      accountId = a.accountId;
      break;
    }
  }
  to -= 100n;
}
if (!owner) throw new Error("no funded account found in the scanned range");
console.log(`simulating as ${owner} (Perpl account ${accountId})`);

const lot = BigInt(Math.max(1, Math.round(3 / mid / 10 ** -mon.config.size_decimals)));
const order = (type: number, px: number) =>
  encodeFunctionData({
    abi: exchangeAbi,
    functionName: "execOrder",
    args: [{
      orderDescId: BigInt(Date.now() + type), perpId: BigInt(mon.id), orderType: type, orderId: 0n,
      pricePNS: BigInt(Math.round(px * 10 ** pd)), lotLNS: lot, expiryBlock: 0n, postOnly: false, fillOrKill: false,
      immediateOrCancel: true, maxMatches: 1000n, leverageHdths: 300n, lastExecutionBlock: 0n, amountCNS: 0n,
      maxNegPnlCollatBPS: 1000n,
    }],
  });
const pos = encodeFunctionData({ abi: exchangeAbi, functionName: "getPosition", args: [BigInt(mon.id), accountId] });

const gas = await pc.estimateGas({ account: owner, to: EX, data: order(ONCHAIN.OPEN_LONG, mid * 1.004) });
const r = await pc.simulateCalls({
  account: owner,
  calls: [
    { to: EX, data: order(ONCHAIN.OPEN_LONG, mid * 1.004) },
    { to: EX, data: pos },
    { to: EX, data: order(ONCHAIN.CLOSE_LONG, mid * 0.996) },
    { to: EX, data: pos },
  ],
});
const read = (i: number) => decodeFunctionResult({ abi: exchangeAbi, functionName: "getPosition", data: r.results[i].data! })[0];
const opened = read(1);
const closed = read(3);
const ok = r.results.every((x) => x.status === "success") && opened.lotLNS === lot && closed.lotLNS === 0n;
console.log(`open  → ${r.results[0].status}, position ${opened.lotLNS} lots @ ${Number(opened.pricePNS) / 10 ** pd}, margin ${Number(opened.depositCNS) / 1e6} AUSD`);
console.log(`close → ${r.results[2].status}, position ${closed.lotLNS} lots`);
console.log(`gas estimate per order ≈ ${gas}`);
console.log(ok ? "✓ direct onchain Perpl orders work" : "✗ unexpected result");
process.exit(ok ? 0 : 1);
