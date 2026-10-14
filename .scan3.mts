import { createPublicClient, http, decodeEventLog } from "viem";
import { monad } from "viem/chains";
import fs from "node:fs";
const full = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); const abi = full.abi ?? full;
const pc = createPublicClient({ chain: monad, transport: http("https://rpc1.monad.xyz") });
const EX = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";
const ACC = 5487n;
const from = 113163000n, head = await pc.getBlockNumber();
const seen = new Map<string, Set<string>>();
for (let a = from; a <= head; a += 100n) {
  const b = a + 99n > head ? head : a + 99n;
  let logs; try { logs = await pc.getLogs({ address: EX, fromBlock: a, toBlock: b }); } catch { continue; }
  for (const l of logs) {
    let d; try { d = decodeEventLog({ abi, data: l.data, topics: l.topics }); } catch { continue; }
    const x: any = d.args;
    if (x?.accountId !== ACC) continue;
    const s = seen.get(l.transactionHash!) ?? new Set(); s.add(d.eventName); seen.set(l.transactionHash!, s);
  }
}
for (const [h, s] of seen) console.log(h, [...s].join(","));
