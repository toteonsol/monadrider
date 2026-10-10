# Perpl WS relay (Cloudflare Worker)

Perpl's trading WebSocket rejects **browser** origins (it only accepts
server-to-server connections). This tiny Worker relays the WS so the Hyperider
browser game can trade Perpl: **browser → this worker → Perpl**.

It's a **dumb byte-pipe**. It stores nothing and inspects nothing. Your Ed25519
Perpl key never leaves your browser — only already-signed frames pass through.
Upstream is hard-locked to Perpl (mainnet, or `?testnet=true`), so it can't be
abused to proxy other WebSockets. A Perpl API key can't withdraw regardless.

## Deploy (one time, ~3 minutes)

**Option A — command line (recommended):**

```bash
npm install -g wrangler          # Cloudflare's CLI
cd workers/perpl-relay
wrangler login                    # opens the browser to authorize (free account)
wrangler deploy                   # prints your worker URL, e.g. https://perpl-relay.<you>.workers.dev
```

**Option B — dashboard:** create a Worker at dash.cloudflare.com → Workers &
Pages → Create → paste the contents of `src/index.js` → Deploy. Note the URL.

## Point the app at it

The worker URL is `https://perpl-relay.<you>.workers.dev`. The app connects with
`wss://` (secure WebSocket), so set this Vercel env var to the **wss** form:

```
NEXT_PUBLIC_PERPL_WS_RELAY = wss://perpl-relay.<you>.workers.dev
```

Then redeploy Hyperider. `PERPL.wsUrl` picks it up automatically; if it's unset,
the app falls back to Perpl directly (which only works from a server).

## Verify

Visit `https://perpl-relay.<you>.workers.dev` in a browser → it should say
`Perpl WS relay · OK`. Then in the game / `/dev/perpl`, **connect + auth** should
reach `✓ authed · accountId …`.
