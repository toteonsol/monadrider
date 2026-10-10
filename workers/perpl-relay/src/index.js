/**
 * Perpl WebSocket relay · Cloudflare Worker.
 *
 * Perpl's trading WS (wss://app.perpl.xyz/ws/v1/trading) rejects BROWSER
 * origins — it works only from a server (no Origin header). This Worker is a
 * dumb byte-pipe that sits in between: the browser opens a WS to THIS worker,
 * the worker opens a WS to Perpl server-to-server, and frames are piped both
 * ways verbatim.
 *
 * SECURITY: nothing is stored or inspected here. The user's Ed25519 API key
 * never leaves their browser — only already-signed frames (ApiKeySignIn +
 * OrderRequest) pass through. The relay cannot place orders on its own or
 * withdraw anything (a Perpl API key can't withdraw regardless).
 *
 * Upstream is locked to Perpl only (mainnet, or testnet via ?testnet=true) so
 * the relay can't be abused to proxy arbitrary WebSockets.
 */
// Cloudflare Workers open outbound WebSockets by fetch()ing an HTTPS URL with
// the Upgrade header — the wss:// scheme is rejected by the Fetch API here.
const MAINNET = "https://app.perpl.xyz/ws/v1/trading";
const TESTNET = "https://testnet.perpl.xyz/ws/v1/trading";

export default {
  async fetch(request) {
    if (new URL(request.url).pathname === "/debug") {
      try {
        const r = await fetch(MAINNET, { headers: { Upgrade: "websocket" } });
        return new Response(`upstream status=${r.status} hasWebSocket=${!!r.webSocket}`, {
          status: 200,
        });
      } catch (e) {
        return new Response(`upstream threw: ${e}`, { status: 200 });
      }
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Perpl WS relay · OK. Connect with a WebSocket.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    const testnet = new URL(request.url).searchParams.get("testnet") === "true";
    const upstreamUrl = testnet ? TESTNET : MAINNET;

    // Open the upstream WS to Perpl server-to-server (no browser Origin sent).
    let upstream;
    try {
      const resp = await fetch(upstreamUrl, { headers: { Upgrade: "websocket" } });
      upstream = resp.webSocket;
      if (!upstream) return new Response("relay: upstream did not upgrade", { status: 502 });
    } catch (e) {
      return new Response(`relay: upstream connect failed: ${e}`, { status: 502 });
    }

    // The client<->worker side.
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    upstream.accept();

    // Pipe both directions verbatim.
    server.addEventListener("message", (e) => {
      try {
        upstream.send(e.data);
      } catch {
        /* upstream gone */
      }
    });
    upstream.addEventListener("message", (e) => {
      try {
        server.send(e.data);
      } catch {
        /* client gone */
      }
    });

    const closeBoth = () => {
      try {
        server.close();
      } catch {
        /* noop */
      }
      try {
        upstream.close();
      } catch {
        /* noop */
      }
    };
    server.addEventListener("close", closeBoth);
    upstream.addEventListener("close", closeBoth);
    server.addEventListener("error", closeBoth);
    upstream.addEventListener("error", closeBoth);

    return new Response(null, { status: 101, webSocket: client });
  },
};
