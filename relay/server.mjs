/**
 * Game server + Perpl socket relay · Node, for Railway or any host that runs Node.
 *
 * HTTP /api/* is the Paddock (rides, standings, streaks), see game.mjs.
 *
 * Perpl's trading WebSocket refuses connections that carry a browser Origin, so
 * a web app cannot reach it directly. This relay accepts the browser's socket
 * and opens a server-to-server one to Perpl, then pipes frames both ways.
 *
 * It stores nothing and reads nothing. Frames arrive already signed by the
 * user's Ed25519 key in their browser; the relay cannot create or alter a
 * signature, and a Perpl API key cannot withdraw funds anyway.
 *
 * Upstream is fixed to Perpl's two socket paths (trading and market data, on
 * mainnet or testnet with ?testnet=true), so the relay cannot reach any other host.
 *
 *   PORT=8787 node relay/server.mjs
 *   ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000   (optional)
 */
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { handleGame } from "./game.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";

// Tickets from the app's /api/geo (issued only outside Perpl's geo_block list)
const TICKET_SECRET = process.env.RELAY_TICKET_SECRET || "";
function validTicket(t) {
  if (!TICKET_SECRET) return true; // local development
  const [exp, mac] = String(t || "").split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const want = createHmac("sha256", TICKET_SECRET).update(exp).digest("base64url");
  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(want));
  } catch {
    return false;
  }
}

const PORT = Number(process.env.PORT || 8787);
const MAINNET = "wss://app.perpl.xyz";
const TESTNET = "wss://testnet.perpl.xyz";
// The only upstream paths the relay will open.
const PATHS = new Set(["/ws/v1/trading", "/ws/v1/market-data"]);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  if (await handleGame(req, res, ALLOWED)) return;
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Ride the Now · Monad game server + Perpl relay · OK");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url || "/", "http://relay");
  if (!PATHS.has(pathname)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  if (pathname === "/ws/v1/trading" && !validTicket(new URL(req.url || "/", "http://relay").searchParams.get("ticket"))) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const origin = req.headers.origin || "";
  if (ALLOWED.length && !ALLOWED.includes(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => wss.emit("connection", client, req));
});

wss.on("connection", (client, req) => {
  const url = new URL(req.url || "/", "http://relay");
  const testnet = url.searchParams.get("testnet") === "true";
  // No Origin header on this side: Perpl sees a server-to-server connection.
  const upstream = new WebSocket((testnet ? TESTNET : MAINNET) + url.pathname);
  upstream.on("unexpected-response", (_q, res) => {
    try {
      client.send(JSON.stringify({ mt: 0, relay: "upstream-refused", status: res.statusCode }));
    } catch {}
  });
  const queue = [];

  upstream.on("open", () => {
    for (const f of queue.splice(0)) upstream.send(f);
  });
  client.on("message", (data, isBinary) => {
    const frame = isBinary ? data : data.toString();
    if (upstream.readyState === WebSocket.OPEN) upstream.send(frame);
    else if (upstream.readyState === WebSocket.CONNECTING) queue.push(frame);
  });
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(isBinary ? data : data.toString());
  });

  const closeBoth = () => {
    try {
      client.close();
    } catch {}
    try {
      upstream.close();
    } catch {}
  };
  client.on("close", closeBoth);
  // pass Perpl's own close code and reason through, so the app can say why
  upstream.on("close", (code, reason) => {
    const sendable = code === 1000 || (code >= 3000 && code <= 4999);
    // some proxies drop custom close codes, so say it in a frame first too
    try {
      if (code !== 1000 && client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify({ mt: 0, relay: "upstream-closed", code, reason: String(reason).slice(0, 120) }));
    } catch {}
    try {
      if (sendable) client.close(code, String(reason).slice(0, 120));
      else client.close();
    } catch {}
    closeBoth();
  });
  client.on("error", closeBoth);
  upstream.on("error", closeBoth);
});

server.listen(PORT, () => console.log(`perpl relay listening on :${PORT}`));
