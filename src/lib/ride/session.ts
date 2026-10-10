/**
 * The live ride's onchain trail · every Perpl order the engine sends during a
 * ride lands here, so the ride can be submitted with its Monad tx hashes and
 * verified by the game server ("receipts, not claims").
 */
let txids: string[] = [];

export function pushRideTx(hash?: string) {
  if (hash && !txids.includes(hash)) txids.push(hash);
}

export function peekRideTxids(): readonly string[] {
  return txids;
}

/** Hand the trail to the ride submit and start a fresh one. */
export function takeRideTxids(): string[] {
  const out = txids;
  txids = [];
  return out;
}
