/**
 * Perpl trading WebSocket client · orders are WS-only on Perpl (REST is read).
 *
 * One authenticated socket per key. On open we send the Ed25519-signed
 * ApiKeySignIn (mt29) as the first frame, then track the account (id + `lfr`
 * for the strictly-increasing `rq` idempotency key), open positions, and the
 * Monad head block (for each order's last-execution-block expiry). Orders are
 * fired as OrderRequest (mt22) and resolved when the matching Order update
 * (by `rq`) reaches a terminal status. Auto-reconnects with backoff.
 *
 * Spec: PerplFoundation/api-docs (websocket.md, types.md).
 */
import { PERPL, MT, ORDER, FLAG, type PerplMarket, fetchPerplContext } from "./config";
import { wsSignInFrame } from "./sign";
import type { PerplKey } from "./agent";

type Resolver = (o: OrderUpdate) => void;
interface OrderUpdate {
  rq: number;
  st: number; // OrderStatus
  sr: number; // OrderStatusReason
  fs: number; // filled size (scaled)
  fp: number; // fill price (scaled)
  f: number; // fee (scaled collateral)
  txid?: string; // Monad tx that settled it (from the update's `at`)
  block?: number;
}
interface PosnState {
  szi: number; // signed human size (+long / -short)
  entryPx: number; // human
}

const now = () => Date.now();

type Obj = Record<string, unknown>;
/** Depth-first search for the first object matching `pred` (handles the
 *  snapshot's unknown nesting so we don't hard-code wrapper keys). */
function deepFind(root: unknown, pred: (o: Obj) => boolean, depth = 6): Obj | null {
  if (depth < 0 || root == null || typeof root !== "object") return null;
  if (!Array.isArray(root) && pred(root as Obj)) return root as Obj;
  for (const v of Array.isArray(root) ? root : Object.values(root as Obj)) {
    const hit = deepFind(v, pred, depth - 1);
    if (hit) return hit;
  }
  return null;
}
/** DFS for the first array whose items match `pred` (e.g. the positions list). */
function deepFindArray(root: unknown, pred: (o: Obj) => boolean, depth = 6): Obj[] | null {
  if (depth < 0 || root == null || typeof root !== "object") return null;
  if (Array.isArray(root)) {
    if (root.length && root.every((x) => x && typeof x === "object" && pred(x as Obj)))
      return root as Obj[];
    for (const v of root) {
      const hit = deepFindArray(v, pred, depth - 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const v of Object.values(root as Obj)) {
    const hit = deepFindArray(v, pred, depth - 1);
    if (hit) return hit;
  }
  return null;
}

const TERMINAL_OK = new Set([3, 4, 10]); // PartiallyFilled, Filled, Executed
const TERMINAL_BAD = new Set([5, 6, 7]); // Canceled, Expired, Failed
const ORDER_TIMEOUT_MS = 9000;
const DEFAULT_LEVERAGE_X = 3; // 3× · small quick-closed churn positions, low liq risk

export class PerplWs {
  private key: PerplKey;
  private ws: WebSocket | null = null;
  private authed = false;
  private accountId = 0;
  private lfr = 0; // last forwarded request id (seed for rq)
  private rqCounter = 0;
  private headBlock = 0;
  private lastSn: number | null = null;
  private positions = new Map<number, PosnState>(); // by market id
  private pending = new Map<number, { resolve: Resolver; at: number }>(); // by rq
  private restingOids = new Map<number, number>(); // resting maker order oid → market id
  private markets: Record<string, PerplMarket> = {};
  private collateralDecimals = 6; // aUSD/USDC · from min amounts (10 USDC = 1e7)
  private ready: Promise<void> | null = null;
  private retry = 0;
  private closed = false;
  private lastSnapshot: unknown = null;
  // live session accounting (so the game shows real numbers, not 0/0)
  private sessionVolume = 0; // USD notional traded
  private sessionFees = 0; // USD fees paid (negative slice = maker rebate)
  private sessionFills = 0;
  // the same tallies per market · a ride counts its own market only (2026-10-08)
  private byMarket = new Map<number, { volume: number; fees: number; fills: number }>();
  private balance = 0; // free collateral (USD)
  private locked = 0; // margin locked by open positions (USD)
  private startEquity: number | null = null; // free+locked at session start
  private forwarding: boolean | null = null; // Account.fw · one-click trading

  constructor(key: PerplKey) {
    this.key = key;
  }

  /** Connect + authenticate + load market context. Idempotent. */
  async ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const ctx = await fetchPerplContext();
      this.markets = ctx.markets;
      // seed the head block so the very first order has a valid expiry (lb);
      // heartbeats keep it current after that.
      if (ctx.headBlock > this.headBlock) this.headBlock = ctx.headBlock;
      await this.connect();
    })();
    return this.ready;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === "undefined") return reject(new Error("no WebSocket"));
      const ws = new WebSocket(`${PERPL.wsUrl}/ws/v1/trading${PERPL.wsQuery}`);
      this.ws = ws;
      let settled = false;
      const authTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Perpl WS auth timed out"));
        }
      }, 10000);

      ws.onopen = async () => {
        const frame = await wsSignInFrame(this.key.apiKey, this.key.privateKey);
        ws.send(JSON.stringify(frame));
        // keep-alive ping every 30s
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ mt: MT.PING, t: now() }));
          else clearInterval(ping);
        }, 30000);
      };

      ws.onmessage = (ev) => {
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        this.dispatch(m);
        // first WalletSnapshot (mt19) means we're authed + have accountId
        if (!settled && m.mt === MT.WALLET_SNAPSHOT) {
          settled = true;
          this.authed = true;
          this.retry = 0;
          clearTimeout(authTimer);
          resolve();
        }
      };

      ws.onclose = (ev) => {
        this.authed = false;
        if (!settled) {
          settled = true;
          clearTimeout(authTimer);
          reject(new Error(`Perpl WS closed before auth (code ${ev.code})`));
        }
        if (!this.closed) this.scheduleReconnect();
      };
      ws.onerror = () => {
        /* onclose handles the reconnect */
      };
    });
  }

  private scheduleReconnect() {
    const delays = [1000, 2000, 4000, 8000, 16000, 30000];
    const d = delays[Math.min(this.retry, delays.length - 1)];
    this.retry++;
    setTimeout(() => {
      if (this.closed) return;
      this.connect().catch(() => {
        /* onclose will schedule the next attempt */
      });
    }, d);
  }

  private dispatch(m: Record<string, unknown>) {
    switch (m.mt) {
      case MT.WALLET_SNAPSHOT: {
        this.lastSnapshot = m; // captured raw for diagnostics
        // The account is nested somewhere in the snapshot under an unknown key;
        // deep-search for the object carrying `lfr` (Account signature) so we
        // read the real accountId + rq seed regardless of wrapper shape.
        const acc = deepFind(m, (o) => typeof o.lfr === "number" && typeof o.id === "number");
        if (acc) this.applyAccount(acc);
        if (typeof m.sn === "number") this.lastSn = m.sn as number;
        const posList = deepFindArray(m, (o) => typeof o.mkt === "number" && "sd" in o);
        if (posList) this.applyPositions(posList);
        break;
      }
      case MT.ACCOUNT_UPDATE:
        this.applyAccount(m);
        break;
      case MT.POSITIONS_SNAPSHOT:
      case MT.POSITIONS_UPDATE:
        this.applyPositions(
          deepFindArray(m, (o) => typeof o.mkt === "number" && "sd" in o) ?? (m.d as unknown));
        break;
      case MT.ORDERS_SNAPSHOT:
      case MT.ORDERS_UPDATE:
        // deep-search for the order list (items carry rq + st) so order
        // resolution doesn't depend on the exact wrapper key.
        this.applyOrders(
          deepFindArray(m, (o) => "rq" in o && "st" in o) ?? (m.d as unknown));
        break;
      case MT.FILLS_UPDATE: {
        // Each Fill (mt25): p (price), s (size), f (fee · negative = rebate).
        const fills = deepFindArray(m, (o) => "s" in o && "f" in o) ?? [];
        for (const fl of fills) {
          const mkt = this.marketById(Number(fl.mkt));
          if (!mkt) continue;
          const sz = Number(fl.s ?? 0) / 10 ** mkt.sizeDecimals;
          const px = Number(fl.p ?? 0) / 10 ** mkt.priceDecimals;
          const fee = Number(fl.f ?? 0) / 10 ** this.collateralDecimals;
          this.sessionVolume += Math.abs(sz * px);
          this.sessionFees += fee;
          this.sessionFills += 1;
          const t = this.byMarket.get(mkt.id) ?? { volume: 0, fees: 0, fills: 0 };
          t.volume += Math.abs(sz * px);
          t.fees += fee;
          t.fills += 1;
          this.byMarket.set(mkt.id, t);
        }
        break;
      }
      case MT.HEARTBEAT: {
        if (typeof m.h === "number") this.headBlock = m.h as number;
        const sn = m.sn as number | undefined;
        if (sn != null && this.lastSn != null && sn !== this.lastSn + 1) {
          // sequence gap · force a fresh snapshot
          this.ws?.close();
        }
        if (sn != null) this.lastSn = sn;
        break;
      }
    }
  }

  private applyAccount(a: Record<string, unknown>) {
    if (typeof a.id === "number") this.accountId = a.id as number;
    if (typeof a.fw === "boolean") this.forwarding = a.fw;
    if (typeof a.lfr === "number") {
      this.lfr = a.lfr as number;
      if (this.rqCounter < this.lfr) this.rqCounter = this.lfr;
    }
    // free (b) + locked (lb) collateral → USD. Total equity (free+locked) is
    // the right realized-pnl anchor: opening a position moves margin free→locked
    // (equity unchanged), so it never looks like a loss.
    const scale = 10 ** this.collateralDecimals;
    if (a.b != null) this.balance = Number(a.b) / scale;
    if (a.lb != null) this.locked = Number(a.lb) / scale;
    if (this.startEquity == null && a.b != null)
      this.startEquity = this.balance + this.locked;
  }

  private applyPositions(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    for (const p of list as Record<string, unknown>[]) {
      const mkt = Number(p.mkt);
      const market = this.marketById(mkt);
      if (!market) continue;
      const sizeH = Number(p.s ?? 0) / 10 ** market.sizeDecimals;
      const sign = Number(p.sd) === 2 ? -1 : 1; // 1=Long, 2=Short
      const entry = Number(p.ep ?? 0) / 10 ** market.priceDecimals;
      const status = Number(p.st ?? 0);
      // closed/zero positions drop out of the map
      if (sizeH < 1e-12 || status === 0) this.positions.delete(mkt);
      else this.positions.set(mkt, { szi: sign * sizeH, entryPx: entry });
    }
  }

  private applyOrders(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    for (const o of list as Record<string, unknown>[]) {
      const st = Number(o.st);
      const oid = Number(o.oid ?? 0);
      // Track resting maker orders (so cancelAll can clear the grid). st 2=Open,
      // 3=PartiallyFilled still rest; terminal states drop out.
      if (oid) {
        if (st === 2 || st === 3) this.restingOids.set(oid, Number(o.mkt));
        else if (TERMINAL_OK.has(st) || TERMINAL_BAD.has(st)) this.restingOids.delete(oid);
      }
      const rq = Number(o.rq);
      const p = this.pending.get(rq);
      if (!p) continue;
      if (TERMINAL_OK.has(st) || TERMINAL_BAD.has(st)) {
        this.pending.delete(rq);
        const at = (o.at ?? {}) as Record<string, unknown>;
        p.resolve({
          rq,
          st,
          sr: Number(o.sr ?? 0),
          fs: Number(o.fs ?? 0),
          fp: Number(o.fp ?? 0),
          f: Number(o.f ?? 0),
          txid: typeof at.txid === "string" ? at.txid : undefined,
          block: typeof at.b === "number" ? at.b : undefined,
        });
      }
    }
  }

  private marketById(id: number): PerplMarket | undefined {
    return Object.values(this.markets).find((m) => m.id === id);
  }

  private nextRq(): number {
    this.rqCounter = Math.max(this.rqCounter, this.lfr) + 1;
    return this.rqCounter;
  }

  market(name: string): PerplMarket | undefined {
    return this.markets[name];
  }

  /** Snapshot for the dev harness / status chips. */
  info() {
    return {
      authed: this.authed,
      accountId: this.accountId,
      headBlock: this.headBlock,
      lfr: this.lfr,
    };
  }

  /** Exchange account state from the socket: free + locked AUSD, and whether
   *  one-click trading (order forwarding) is on. */
  account(): { accountId: number; free: number; locked: number; forwarding: boolean | null } {
    return { accountId: this.accountId, free: this.balance, locked: this.locked, forwarding: this.forwarding };
  }

  /** The wallet that owns this key's account, from the wallet snapshot. */
  walletAddress(): string | null {
    const a = (this.lastSnapshot as { addr?: unknown } | null)?.addr;
    return typeof a === "string" ? a : null;
  }

  /** Raw first wallet snapshot (diagnostics · reveals the real field nesting). */
  rawSnapshot(): unknown {
    return this.lastSnapshot;
  }

  /** Live session numbers for the game HUD (real volume/fees/pnl, not 0/0). */
  stats(): { volume: number; fees: number; fills: number; pnl: number } {
    let unrealized = 0;
    for (const [mkt, p] of this.positions) {
      const m = this.marketById(mkt);
      if (m?.mid) unrealized += p.szi * (m.mid - p.entryPx);
    }
    // realized = equity change (free+locked), immune to margin locking
    const realized = this.startEquity != null ? this.balance + this.locked - this.startEquity : 0;
    return {
      volume: this.sessionVolume,
      fees: this.sessionFees,
      fills: this.sessionFills,
      pnl: realized + unrealized,
    };
  }

  /** ONE MARKET'S MONEY · what a ride on `name` reads (lib/game/rideMoney).
   *  The client is shared by everything trading this key (a desk book on
   *  another market, a hand-opened position), so the account-wide stats()
   *  mixed their fills and their closes into the ride's net and its guards.
   *  Returns this market's running tallies + its own unrealized, and the
   *  account's cash with every market's size so a step in which another
   *  market traded can be set aside (lighterStep). */
  marketLedger(name: string): {
    volume: number;
    fees: number;
    fills: number;
    unrealized: number;
    cash: number | null;
    positions: Record<string, { position: number; funding: number }>;
  } {
    const m = this.markets[name];
    const t = (m && this.byMarket.get(m.id)) || { volume: 0, fees: 0, fills: 0 };
    const p = m ? this.positions.get(m.id) : undefined;
    const unrealized = p && m?.mid ? p.szi * (m.mid - p.entryPx) : 0;
    const positions: Record<string, { position: number; funding: number }> = {};
    for (const [id, pos] of this.positions) {
      const mm = this.marketById(id);
      if (mm) positions[mm.name ?? String(id)] = { position: pos.szi, funding: 0 };
    }
    return {
      ...t,
      unrealized,
      cash: this.startEquity != null ? this.balance + this.locked : null,
      positions,
    };
  }

  getPosition(name: string): { szi: number; entryPx: number; positionValue: number } | null {
    const m = this.markets[name];
    if (!m) return null;
    const p = this.positions.get(m.id);
    if (!p || Math.abs(p.szi) < 1e-12) return null;
    const px = m.mid || p.entryPx;
    return { szi: p.szi, entryPx: p.entryPx, positionValue: Math.abs(p.szi) * px };
  }

  /** Refresh touch/mid from the public context (cheap, cached ~2s upstream). */
  async touch(name: string): Promise<{ bid: number; ask: number; mid: number }> {
    const ctx = await fetchPerplContext();
    this.markets = ctx.markets;
    const m = this.markets[name];
    if (!m) throw new Error(`Perpl market ${name} unknown`);
    return { bid: m.bid, ask: m.ask, mid: m.mid };
  }

  /** Fire a market order (IOC) and await its terminal status. `t` = ORDER.* */
  private async sendMarket(name: string, t: number, sizeHuman: number): Promise<OrderUpdate> {
    await this.ensureReady();
    const m = this.markets[name];
    if (!m) throw new Error(`Perpl market ${name} unknown`);
    if (!this.headBlock) {
      // seed head block from context if no heartbeat seen yet (a 0 block =
      // instantly-expired order → silent drop)
      const ctx = await fetchPerplContext();
      this.markets = ctx.markets;
      this.headBlock = ctx.headBlock;
    }
    if (!this.accountId) throw new Error("Perpl account not resolved yet (no wallet snapshot)");
    const rq = this.nextRq();
    const s = Math.max(1, Math.round(sizeHuman * 10 ** m.sizeDecimals));
    const frame = {
      mt: MT.ORDER_REQUEST,
      rq,
      mkt: m.id,
      acc: this.accountId,
      t,
      p: 0, // market
      s,
      ms: m.maxSlippageBps,
      fl: FLAG.IOC,
      lv: DEFAULT_LEVERAGE_X * 100,
      lb: this.headBlock + m.orderTtlBlocks,
    };
    const result = new Promise<OrderUpdate>((resolve) => {
      this.pending.set(rq, { resolve, at: now() });
      setTimeout(() => {
        if (this.pending.has(rq)) {
          this.pending.delete(rq);
          resolve({ rq, st: 7, sr: -1, fs: 0, fp: 0, f: 0 }); // timeout → treat as failed
        }
      }, ORDER_TIMEOUT_MS);
    });
    this.ws?.send(JSON.stringify(frame));
    return result;
  }

  /** Open (isBuy → long) a market position of ~usdNotional. */
  async openMarket(name: string, isBuy: boolean, usdNotional: number) {
    const m = this.markets[name] ?? (await this.ensureReady(), this.markets[name]);
    const mid = m?.mid || (await this.touch(name)).mid;
    const sizeHuman = usdNotional / mid;
    const u = await this.sendMarket(name, isBuy ? ORDER.OPEN_LONG : ORDER.OPEN_SHORT, sizeHuman);
    return this.toResult(name, u, usdNotional);
  }

  /** Close whatever position is open on `name` (opposite-side market IOC). */
  async close(name: string) {
    await this.ensureReady();
    const pos = this.getPosition(name);
    if (!pos) return { status: "error" as const, error: "no open position" };
    const t = pos.szi > 0 ? ORDER.CLOSE_LONG : ORDER.CLOSE_SHORT;
    const u = await this.sendMarket(name, t, Math.abs(pos.szi));
    return this.toResult(name, u, pos.positionValue);
  }

  private async ensureBlockAndAccount(name: string): Promise<PerplMarket> {
    await this.ensureReady();
    const m = this.markets[name];
    if (!m) throw new Error(`Perpl market ${name} unknown`);
    if (!this.headBlock) {
      const ctx = await fetchPerplContext();
      this.markets = ctx.markets;
      this.headBlock = ctx.headBlock;
    }
    if (!this.accountId) throw new Error("Perpl account not resolved yet (no wallet snapshot)");
    return this.markets[name];
  }

  /** Rest a POST-ONLY maker quote at the touch (the 0.9bps grid path). isBuy
   *  buys the synthetic; reduceOnly quotes only shrink inventory (Close* types).
   *  It rests, the fill is detected by the grid's position polling. */
  async restMaker(name: string, isBuy: boolean, usdNotional: number, reduceOnly: boolean) {
    const m = await this.ensureBlockAndAccount(name);
    // post-only at the touch: buy joins the bid, sell joins the ask, never crosses.
    const px = isBuy ? m.bid : m.ask;
    if (!px) return { status: "error" as const, error: "no touch price" };
    const sizeHuman = usdNotional / (m.mid || px);
    const t = reduceOnly
      ? isBuy
        ? ORDER.CLOSE_SHORT // buy to close a short
        : ORDER.CLOSE_LONG // sell to close a long
      : isBuy
        ? ORDER.OPEN_LONG
        : ORDER.OPEN_SHORT;
    const rq = this.nextRq();
    const frame = {
      mt: MT.ORDER_REQUEST,
      rq,
      mkt: m.id,
      acc: this.accountId,
      t,
      p: Math.max(1, Math.round(px * 10 ** m.priceDecimals)),
      s: Math.max(1, Math.round(sizeHuman * 10 ** m.sizeDecimals)),
      fl: FLAG.POST_ONLY,
      lv: DEFAULT_LEVERAGE_X * 100,
      lb: this.headBlock + m.orderTtlBlocks,
    };
    this.ws?.send(JSON.stringify(frame));
    return { status: "resting" as const, maker: true, notional: usdNotional, builderFeeUsd: 0 };
  }

  /** Cancel every resting maker order on `name` (grid re-quote / flatten). */
  async cancelAllOrders(name: string) {
    const m = this.markets[name];
    if (!m || !this.accountId) return;
    for (const [oid, mkt] of this.restingOids) {
      if (mkt !== m.id) continue;
      this.ws?.send(
        JSON.stringify({
          mt: MT.ORDER_REQUEST,
          rq: this.nextRq(),
          mkt: m.id,
          acc: this.accountId,
          oid,
          t: ORDER.CANCEL,
          p: 0,
          s: 0,
          fl: FLAG.GTC,
          lv: 0,
          lb: this.headBlock + m.orderTtlBlocks,
        }));
      this.restingOids.delete(oid);
    }
  }

  private toResult(name: string, u: OrderUpdate, notional: number) {
    const m = this.markets[name];
    if (TERMINAL_OK.has(u.st)) {
      const filledSz = m ? u.fs / 10 ** m.sizeDecimals : u.fs;
      const avgPx = m && u.fp ? u.fp / 10 ** m.priceDecimals : 0;
      return {
        status: "filled" as const,
        filledSz: String(filledSz),
        avgPx: avgPx ? String(avgPx) : undefined,
        notional: avgPx ? filledSz * avgPx : notional,
        builderFeeUsd: 0,
        fee: u.f / 10 ** this.collateralDecimals,
        txid: u.txid,
        block: u.block,
      };
    }
    return { status: "error" as const, error: `order ${u.st === 7 ? "failed" : "not filled"} (reason ${u.sr})` };
  }

  disconnect() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.ready = null;
  }
}

// one live client per api-key token · reused across the app
const clients = new Map<string, PerplWs>();
/** The last balance the venue pushed over an ALREADY-OPEN socket, or null.
 *
 *  Perpl has no REST account read — balance arrives on the trading socket's
 *  wallet snapshots. Opening a connection just to show a number would cost a
 *  session per glance, so this only peeks at a socket the desk already holds;
 *  the screen says "connects when you ride" for the null case. */
export function peekPerplBalanceUsd(): number | null {
  for (const ws of clients.values()) {
    const b = (ws as unknown as { balance?: number }).balance;
    if (typeof b === "number" && Number.isFinite(b) && b > 0) return b;
  }
  return null;
}

/** Forget a client (bad key, or the rider disconnected): closes its socket. */
export function dropPerplWs(apiKey: string): void {
  const c = clients.get(apiKey);
  c?.disconnect();
  clients.delete(apiKey);
}

export function getPerplWs(key: PerplKey): PerplWs {
  let c = clients.get(key.apiKey);
  if (!c) {
    c = new PerplWs(key);
    clients.set(key.apiKey, c);
  }
  return c;
}
