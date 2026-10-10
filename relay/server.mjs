/**
 * Perpl trading-socket relay · Node, for Railway or any host that runs Node.
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

const PORT = Number(process.env.PORT || 8787);
const MAINNET = "wss://app.perpl.xyz";
const TESTNET = "wss://testnet.perpl.xyz";
// The only upstream paths the relay will open.
const PATHS = new Set(["/ws/v1/trading", "/ws/v1/market-data"]);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Perpl WS relay · OK. Connect with a WebSocket.");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url || "/", "http://relay");
  if (!PATHS.has(pathname)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
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
  upstream.on("close", closeBoth);
  client.on("error", closeBoth);
  upstream.on("error", closeBoth);
});

server.listen(PORT, () => console.log(`perpl relay listening on :${PORT}`));
