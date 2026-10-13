/**
 * Game server · the Paddock's shared state for the Monad edition.
 *
 * Rides, the leaderboard, streaks and percentiles live here, in this repo's own
 * service (no third-party backend). One rule from the original game is kept and
 * enforced: receipts, not claims. A ride only counts as LIVE when the Monad
 * transactions it names are real: each must be a successful call from the
 * rider's own address to Perpl's Exchange contract. A ride whose txs don't
 * check out is scored as practice (capped at 150 points).
 *
 * Storage is an append-only JSON-lines file (GAME_DATA, default ./data/rides.jsonl)
 * loaded into memory on boot. Small, inspectable, and enough for a season.
 */
import fs from "node:fs";
import path from "node:path";

const EXCHANGE = "0x34b6552d57a35a1d042ccae1951bd1c370112a6f";
const RPC = process.env.MONAD_RPC || "https://rpc.monad.xyz";
const FILE = process.env.GAME_DATA || path.join(process.cwd(), "data", "rides.jsonl");
const PRACTICE_CAP = 150;
const MAX_CLIP_USD = 100; // the app's hard clip ceiling, per fill
const DAY = 86_400_000;

/** @type {Array<Record<string, any>>} */
const rides = [];
try {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (fs.existsSync(FILE)) {
    for (const line of fs.readFileSync(FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        rides.push(JSON.parse(line));
      } catch {}
    }
  }
} catch (e) {
  console.warn("game store unavailable, running in memory:", e.message);
}
console.log(`game store: ${rides.length} rides from ${FILE}`);

function persist(r) {
  rides.push(r);
  try {
    fs.appendFileSync(FILE, JSON.stringify(r) + "\n");
  } catch {}
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  return j.result;
}

const seenTx = new Set(rides.flatMap((r) => r.txids ?? []));

/** The rider's Perpl account id, read from the Exchange (0 = none). */
async function accountIdOf(address) {
  try {
    const data = "0x12e8eb2c" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0"); // getAccountByAddr(address)
    const r = await rpc("eth_call", [{ to: EXCHANGE, data }, "latest"]);
    return r && r.length >= 66 ? BigInt(r.slice(0, 66)) : 0n;
  } catch {
    return 0n;
  }
}

/** Count the txs that really are this rider's Perpl orders (each tx counts once, ever).
 *  Two shapes are accepted: an order the rider's own wallet sent to the Exchange
 *  (passkey route), or an order Perpl forwarded for them (API-key route), where
 *  the Exchange's logs in that tx must name the rider's Perpl account. */
async function verifyTxs(address, txids) {
  if (!address || !Array.isArray(txids) || !txids.length) return [];
  const ok = [];
  let acctWord = null;
  for (const raw of txids.slice(0, 60)) {
    const h = String(raw).startsWith("0x") ? String(raw) : `0x${raw}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(h) || seenTx.has(h.toLowerCase())) continue;
    try {
      const [tx, rc] = await Promise.all([rpc("eth_getTransactionByHash", [h]), rpc("eth_getTransactionReceipt", [h])]);
      if (!tx || !rc || rc.status !== "0x1") continue;
      if (tx.to?.toLowerCase() !== EXCHANGE) continue;
      if (tx.from?.toLowerCase() !== address.toLowerCase()) {
        if (acctWord === null) {
          const id = await accountIdOf(address);
          acctWord = id > 0n ? id.toString(16).padStart(64, "0") : "";
        }
        const named = acctWord && (rc.logs ?? []).some((l) => l.address?.toLowerCase() === EXCHANGE && (l.data ?? "").toLowerCase().slice(2).match(/.{64}/g)?.includes(acctWord));
        if (!named) continue;
      }
      ok.push(h.toLowerCase());
    } catch {}
  }
  return ok;
}

const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const str = (x, n = 64) => (typeof x === "string" ? x.slice(0, n) : null);

async function submit(body) {
  const rider = str(body.rider, 40);
  if (!rider) return { status: 400, json: { error: "rider required" } };
  const address = /^0x[0-9a-fA-F]{40}$/.test(body.address ?? "") ? body.address.toLowerCase() : null;
  const claimedLive = !!body.live;
  const verified = claimedLive ? await verifyTxs(address, body.txids) : [];
  const live = verified.length > 0;
  for (const h of verified) seenTx.add(h);
  // volume can't exceed what the verified fills could carry
  const realVolume = live ? Math.min(num(body.realVolume), verified.length * MAX_CLIP_USD) : 0;
  const points = live ? Math.min(num(body.points), Math.round(realVolume * 1.5) + PRACTICE_CAP) : Math.min(num(body.points), PRACTICE_CAP);
  const r = {
    ts: Date.now(),
    rider,
    address,
    mode: str(body.mode, 12) ?? "surf",
    asset: str(body.asset, 12),
    live,
    points: Math.max(0, Math.round(points)),
    realVolume,
    realFees: live ? num(body.realFees) : 0,
    realPnl: live ? num(body.realPnl) : 0,
    fills: live ? verified.length : 0,
    crashes: num(body.crashes),
    txids: verified,
    convoy: str(body.convoy, 16),
  };
  persist(r);
  return { status: 200, json: { ok: true, live, verifiedFills: verified.length, points: r.points } };
}

function within(windowMs) {
  const since = windowMs > 0 ? Date.now() - windowMs : 0;
  return rides.filter((r) => r.ts >= since);
}

function top(limit, windowMs) {
  const by = new Map();
  for (const r of within(windowMs)) {
    const t = by.get(r.rider) ?? { rider: r.rider, points: 0, realVolume: 0, rides: 0, realFees: 0, realPnl: 0 };
    t.points += r.points;
    t.realVolume += r.realVolume;
    t.realFees += r.realFees;
    t.realPnl += r.realPnl;
    t.rides += 1;
    by.set(r.rider, t);
  }
  return [...by.values()].sort((a, b) => b.points - a.points).slice(0, limit);
}

function streak(rider) {
  const days = new Set(rides.filter((r) => r.rider === rider).map((r) => Math.floor(r.ts / DAY)));
  let n = 0;
  for (let d = Math.floor(Date.now() / DAY); days.has(d); d--) n++;
  return n;
}

function percentile(points) {
  const all = top(10_000, 30 * DAY).map((t) => t.points);
  if (!all.length) return null;
  return Math.round((all.filter((p) => p <= points).length / all.length) * 100);
}

function field() {
  return [
    ["1d", DAY],
    ["7d", 7 * DAY],
    ["30d", 30 * DAY],
  ].map(([key, ms]) => {
    const w = within(ms);
    const riders = new Set(w.map((r) => r.rider));
    const liveRiders = new Set(w.filter((r) => r.live).map((r) => r.rider));
    return {
      key,
      ms,
      summary: {
        rides: w.length,
        riders: riders.size,
        liveRiders: liveRiders.size,
        liveRides: w.filter((r) => r.live).length,
        realVolume: w.reduce((a, r) => a + r.realVolume, 0),
        points: w.reduce((a, r) => a + r.points, 0),
      },
    };
  });
}

function recent(sinceMs) {
  return within(sinceMs)
    .slice(-60)
    .reverse()
    .map(({ ts, rider, mode, live, asset, realVolume, realPnl, fills, points, txids }) => ({
      ts,
      rider,
      mode,
      live,
      venue: live ? "perpl" : null,
      asset,
      realVolume,
      realPnl,
      fills,
      points,
      tx: txids?.[0] ?? null,
    }));
}

/** Route one HTTP request. Returns true when it handled it. */
export async function handleGame(req, res, allowed) {
  const url = new URL(req.url || "/", "http://x");
  if (!url.pathname.startsWith("/api/")) return false;
  const origin = req.headers.origin || "";
  const cors = {
    "access-control-allow-origin": !allowed.length || allowed.includes(origin) ? origin || "*" : "null",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
  const send = (status, json) => {
    res.writeHead(status, { ...cors, "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(json));
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return true;
  }
  const q = url.searchParams;
  try {
    switch (url.pathname) {
      case "/api/rides": {
        if (req.method !== "POST") return send(405, { error: "POST" }), true;
        let raw = "";
        for await (const c of req) {
          raw += c;
          if (raw.length > 32_000) return send(413, { error: "too large" }), true;
        }
        const r = await submit(JSON.parse(raw || "{}"));
        return send(r.status, r.json), true;
      }
      case "/api/top":
        return send(200, top(Math.min(100, num(q.get("limit"), 5)), q.has("windowMs") ? num(q.get("windowMs")) : DAY)), true;
      case "/api/recent":
        return send(200, recent(num(q.get("sinceMs"), DAY))), true;
      case "/api/streak":
        return send(200, streak(String(q.get("rider") ?? ""))), true;
      case "/api/percentile":
        return send(200, percentile(num(q.get("points")))), true;
      case "/api/field":
        return send(200, field()), true;
      default:
        return send(404, { error: "unknown" }), true;
    }
  } catch (e) {
    return send(500, { error: String(e?.message ?? e) }), true;
  }
}
