/**
 * Perpl venue config · perp CLOB on Monad L1 (venue #4).
 *
 * Unlike HL/Hotstuff (REST) and Lighter (WASM-signed REST), Perpl places orders
 * over an authenticated WebSocket and authenticates with an Ed25519 API key
 * (enrolled once via a wallet EIP-712 signature). This file holds the static
 * endpoints/chain + a lazily-fetched market context (ids + scaling decimals).
 *
 * Docs: github.com/PerplFoundation/api-docs, docs.perpl.xyz
 */

export const PERPL = {
  isTestnet: process.env.NEXT_PUBLIC_PERPL_TESTNET === "true",
  /** Monad chain id · 143 mainnet, 10143 testnet. Signed into every canonical
   *  string, a wrong id makes every signature invalid (cf. Lighter's 304). */
  chainId: process.env.NEXT_PUBLIC_PERPL_TESTNET === "true" ? 10143 : 143,
  /** REST base · `/api` is the prefix; endpoints below are `/v1/...`. */
  apiUrl:
    process.env.NEXT_PUBLIC_PERPL_TESTNET === "true"
      ? "https://testnet.perpl.xyz/api"
      : "https://app.perpl.xyz/api",
  /** WebSocket origin · trading = `${wsUrl}/ws/v1/trading`.
   *  Perpl's trading WS rejects BROWSER origins, so in production this must be
   *  our Cloudflare relay (NEXT_PUBLIC_PERPL_WS_RELAY). Direct Perpl only works
   *  server-side (Node) and is the fallback for scripts/SSR. */
  wsUrl:
    process.env.NEXT_PUBLIC_PERPL_WS_RELAY ||
    (process.env.NEXT_PUBLIC_PERPL_TESTNET === "true"
      ? "wss://testnet.perpl.xyz"
      : "wss://app.perpl.xyz"),
  /** The Origin Perpl must whitelist for programmatic key enrollment. In a
   *  browser the Origin header is set automatically to the page origin; this is
   *  only used for server-side enrollment / documentation. */
  appOrigin:
    process.env.NEXT_PUBLIC_PERPL_TESTNET === "true"
      ? "https://ride-the-now.vercel.app"
      : "https://hyperider.airdropsea.app",
} as const;

/** API-key scope bitmask · 1=read, 2=trade (implies read), 3=both. We enroll
 *  trade-scoped keys; withdrawals/transfers-out are NEVER permitted via a key. */
export const PERPL_SCOPE_TRADE = 3;

/** WS message types (subset we use) · full table in api-docs/websocket.md. */
export const MT = {
  PING: 1,
  SUB_REQUEST: 5,
  L2_SNAPSHOT: 15,
  L2_UPDATE: 16,
  MARKET_STATE: 9,
  WALLET_SNAPSHOT: 19,
  ACCOUNT_UPDATE: 21,
  ORDER_REQUEST: 22,
  ORDERS_SNAPSHOT: 23,
  ORDERS_UPDATE: 24,
  FILLS_UPDATE: 25,
  POSITIONS_SNAPSHOT: 26,
  POSITIONS_UPDATE: 27,
  API_KEY_SIGNIN: 29,
  HEARTBEAT: 100,
} as const;

/** Order types (`t` field on an OrderRequest). */
export const ORDER = {
  OPEN_LONG: 1,
  OPEN_SHORT: 2,
  CLOSE_LONG: 3,
  CLOSE_SHORT: 4,
  CANCEL: 5,
  INCREASE_COLLATERAL: 6,
  CHANGE: 7,
} as const;

/** Order flags (`fl` field). */
export const FLAG = {
  GTC: 0,
  POST_ONLY: 1,
  FOK: 2,
  IOC: 4,
} as const;

/** Curated tradeable markets · MON + SOL FIRST because they carry a live
 *  points_boost (Perpl's "growth mode") · same 0.9/6.9bps fees as the rest,
 *  but boosted points make them the smart-farm picks. Real ids + decimals +
 *  the current boost are resolved live from /v1/pub/context. */
export const PERPL_ASSETS = ["MON", "SOL", "BTC", "ETH", "HYPE", "ZEC"] as const;
export type PerplAsset = (typeof PERPL_ASSETS)[number];

export interface PerplMarket {
  id: number; // market id used in OrderRequest (mkt)
  name: string; // "BTC", "MON", …
  priceDecimals: number; // scale: on-wire price = human × 10^priceDecimals
  sizeDecimals: number; // scale: on-wire size = human × 10^sizeDecimals
  makerFeeBps: number; // hundredths-of-bps → /100 for bps (90 = 0.9bps)
  takerFeeBps: number;
  pointsBoostBps: number; // >0 = boosted ("growth mode"); 20000 = +200%
  orderTtlBlocks: number;
  maxSlippageBps: number;
  bid: number;
  ask: number;
  mid: number;
}

/** Fetch + normalize all Perpl markets from the public context (no auth). */
export async function fetchPerplContext(): Promise<{
  markets: Record<string, PerplMarket>;
  collateralTokenId: number;
  instanceId: number;
  headBlock: number;
}> {
  // Perpl's public context sends no CORS header → a direct browser fetch is
  // blocked. In the browser go through our same-origin proxy; on the server
  // (SSR / scripts) hit Perpl directly.
  const url =
    typeof window === "undefined"
      ? `${PERPL.apiUrl}/v1/pub/context`
      : `/api/perpl/context${PERPL.isTestnet ? "?testnet=true" : ""}`;
  const d = await fetch(url).then((x) => x.json());
  const inst = (d.instances ?? [])[0] ?? {};
  const gas = d.chain?.gas ?? {};
  const headBlock = Number(gas.h ?? gas.at?.b ?? 0);
  const markets: Record<string, PerplMarket> = {};
  for (const m of d.markets ?? []) {
    const c = m.config ?? {};
    const s = m.state ?? {};
    const pd = Number(c.price_decimals ?? 0);
    const scale = 10 ** pd;
    markets[m.name] = {
      id: Number(m.id),
      name: String(m.name),
      priceDecimals: pd,
      sizeDecimals: Number(c.size_decimals ?? 0),
      makerFeeBps: Number(c.maker_fee ?? 0) / 100,
      takerFeeBps: Number(c.taker_fee ?? 0) / 100,
      pointsBoostBps: Number(m.points_boost_bps ?? 0),
      orderTtlBlocks: Number(m.order_ttl_blocks ?? 20),
      maxSlippageBps: Number(m.order_max_market_slippage_bps ?? 100),
      bid: Number(s.bid ?? 0) / scale,
      ask: Number(s.ask ?? 0) / scale,
      mid: Number(s.mid ?? 0) / scale,
    };
  }
  return {
    markets,
    collateralTokenId: Number(inst.collateral_token_id ?? 1),
    instanceId: Number(inst.id ?? 1),
    headBlock,
  };
}
