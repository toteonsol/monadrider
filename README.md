# Ride the Now · Monad edition

**The market is a wave. Ride it on Monad.**

A mobile-first trading game. The live Perpl price draws a wave: ride the **crest** and you're long, sit on the **line** and you're flat, drop into the **trough** and you're short. Every carve is a real, capped perp trade on **Perpl**, sent straight to Perpl's Exchange contract on **Monad** from a wallet you open with a **passkey (Mera)**, margined in **AUSD (Agora)**. When the ride is over, bank it as spot MON on **Kuru**.

- **Track:** Onchain Finance & Trading
- **Bounties:** Agora (best mobile trading app), Kuru (consumer trading app), Perpl (best use of Perpl's API / automation)
- **Licence:** AGPL-3.0
- **Live app:** _added at submission_ · **Demo video:** _added at submission_

---

## What you can do

| Screen | What happens | Onchain |
|---|---|---|
| **Surf** | Steer the wave with a swipe or three thumb buttons. Practice is free; live mode trades Perpl. | One `execOrder` (IOC) tx per carve, from your passkey wallet |
| **Passenger** | The autopilot steers on trend plus Perpl's live order flow, inside the same safety rails, and ends with a P&L and risk receipt. | Same: every order is a Monad tx |
| **Spot** | Buy or sell MON with AUSD through Kuru's onchain order book (Kuru Flow). | One swap tx (+ one approve the first time) |
| **Money** | Passkey wallet, AUSD and MON balances, receive address, move AUSD in and out of Perpl margin, ride history. | `createAccount` / `depositCollateral` / `withdrawCollateral` |

Every live fill on a receipt links to its transaction on MonadScan. A winning live ride can send its winnings back to the wallet as AUSD in one tap.

### Safety rails (every ride)

- **Clip cap:** each position is the same small notional, hard-capped at $100, at 3× leverage.
- **Stop:** a position that moves past the stop against you closes (a "wipeout").
- **Max loss:** the ride ends itself once net P&L reaches your limit.
- **Timer and throttle:** rides end on time, and a minimum gap between orders stops fee churn.
- **Flatten on every exit:** end, stop, max loss, unmount, or leaving the screen all close the position.
- **Starts flat:** a live ride refuses to start if you already hold a position in that market.

---

## How it uses Monad

```
 Passkey (WebAuthn PRF)
        │  Mera derives a BIP-44 Monad account, key held in this tab only
        ▼
 Monad wallet ──AUSD──▶ Perpl Exchange (margin)            Kuru Flow ◀──AUSD/MON──┐
        │                    ▲                                                     │
        │ execOrder (IOC)    │ fills, positions read back from contract state      │
        └────────────────────┘                                                     │
        └──────────────────────────── swap ────────────────────────────────────────┘

 Perpl market-data socket ──(relay)──▶ price wave + live tape (every trade carries its Monad txid)
```

**Why this only works on Monad:**

- **~400 ms blocks.** A carve settles before your thumb lifts, so the wave and your position stay in step. A game whose controls are trades needs sub-second finality.
- **≈ $0.001 per order.** About 260k gas per IOC order (measured, see `pnpm verify:onchain`) makes $5 positions sensible, so a newcomer can learn with pocket change.
- **A fully onchain order book.** Perpl matches on Monad itself, so the tape you surf is made of real Monad transactions.
- **Plain EVM accounts.** The passkey-derived account signs everything: perps on Perpl, spot on Kuru, AUSD transfers. No extension, no seed phrase, no custodian.

**Direct onchain orders, not the hosted API.** Perpl's API path needs a per-user API key whose enrolment origin Perpl must whitelist. Because Mera gives the app an in-tab EOA, the app instead calls `Exchange.execOrder` itself. Each carve is the rider's own Monad transaction and needs no key, no whitelist and no forwarding permission.

### Contracts (Monad mainnet, chain 143)

| Contract | Address |
|---|---|
| Perpl Exchange (proxy) | [`0x34B6552d57a35a1D042CcAe1951BD1C370112a6F`](https://monadscan.com/address/0x34B6552d57a35a1D042CcAe1951BD1C370112a6F) |
| AUSD (Agora), 6 decimals | [`0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`](https://monadscan.com/address/0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a) |
| Kuru MON/AUSD order book | [`0x131a2e70a5b31a517a74b8c567149bc294470da9`](https://monadscan.com/address/0x131a2e70a5b31a517a74b8c567149bc294470da9) |
| Kuru Flow entrypoint | [`0xb3e6778480b2E488385E8205eA05E20060B813cb`](https://monadscan.com/address/0xb3e6778480b2E488385E8205eA05E20060B813cb) |

This project deploys no contracts of its own. It is a client of the contracts above.

**Transaction hashes from the demo:** _added at submission (account open, deposit, live carves, Passenger run, Kuru swap, withdraw)._

---

## Run it

Requirements: Node 20+, pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm relay        # terminal 1 · Perpl socket relay on ws://localhost:8787
pnpm dev          # terminal 2 · app on http://localhost:3000
```

Practice mode works immediately with live Perpl prices. For live mode:

1. Open **Money** and create a passkey wallet. Passkeys need HTTPS or `localhost`, and a PRF-capable authenticator: iCloud Keychain (iOS 18+ / macOS), Google Password Manager (Android), or 1Password. Desktop Chrome with a local profile passkey does not support PRF.
2. Send a little **MON** (gas) and some **AUSD** to the wallet address, or swap MON → AUSD on **Spot**.
3. In **Money**, deposit at least 10 AUSD into Perpl. The first deposit opens your Perpl account.
4. Back on **Surf**, switch to **Live · Perpl** and paddle in.

> A passkey wallet is bound to the domain it was created on. The same passkey on a different domain derives a different wallet. Create it on the domain you will keep using.

### Verify

```bash
pnpm verify:engine    # safety rails on scripted price paths (stop, max loss, flatten, flip, ceilings)
pnpm verify:onchain   # simulates an open + close execOrder from a real Perpl account on mainnet (eth_simulateV1, spends nothing)
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PERPL_WS_RELAY` | `ws://localhost:8787` | Relay for Perpl's sockets (they refuse browser origins) |
| `NEXT_PUBLIC_PERPL_TESTNET` | `false` | `true` uses Perpl testnet / Monad testnet 10143 |
| `NEXT_PUBLIC_MONAD_RPC` | `https://rpc.monad.xyz` | RPC for reads, gas estimates and receipts |

### Deploy

- **App:** any Next.js host (Vercel). Set the env vars above.
- **Relay:** `relay/server.mjs` is a stateless Node socket pipe. `railway.json` runs it on Railway; set `ALLOWED_ORIGINS` to the app's origin. A Cloudflare Worker version is in `workers/perpl-relay` (pre-existing, see below).

---

## Architecture

```
src/
  app/                     Next.js app router: shell, /about, PWA manifest, icons
    api/perpl/             same-origin proxies for Perpl's PUBLIC REST (no CORS upstream)
  components/              App shell, RideScreen, WaveCanvas, Money, Spot, receipts
  lib/
    wallet/mera.tsx        passkey → Monad account (Mera), balances
    perpl/onchain.ts       Exchange ABI: account, deposit, withdraw, execOrder, reads
    perpl/market.ts        live wave feed: market-state + trades (with txids) over the relay
    ride/engine.ts         bands → positions, safety rails, executors
    ride/onchainExecutor.ts  live carves as execOrder txs, fills read from contract state
    ride/passenger.ts      autopilot signal (trend + tape flow) with hysteresis
    kuru.ts                Kuru Flow quote + swap
relay/server.mjs           Perpl socket relay (Node)
scripts/                   verify scripts
```

The game talks to venues through two small interfaces: a **feed** (price series + trade tape) and an **executor** (`open`, `close`). Perpl and Kuru are the first two. Any onchain order book on Monad can plug in the same way.

---

## Pre-existing foundation

This edition is built on **Ride the Now**, a private app by the same author that already trades Perpl in production. Per the hackathon rules, these parts existed before 1 Sep 2026 and are imported in clearly labelled commits:

| Path | What it is | Commit |
|---|---|---|
| `src/lib/perpl/config.ts`, `agent.ts`, `sign.ts`, `wsClient.ts` | Perpl market context, Ed25519 API-key signing, trading-socket client | "Import foundation from Ride the Now" |
| `src/app/api/perpl/context/route.ts` | Same-origin proxy for Perpl's public context | same |
| `workers/perpl-relay/` | Cloudflare Worker socket relay | same |
| `src/lib/game/sfx.ts` | Synthesised WebAudio game sounds | "Import pre-existing sfx.ts" |
| The Surfer concept | crest = long, line = flat, trough = short; wipeouts flatten | (design, rebuilt from scratch here) |

Small later edits to the imported Perpl files (relay URL, capturing the settling tx hash, the account `fw` flag) are in their own commits.

**Built during the hackathon (new work):** the mobile-first PWA and its design; the 2D wave renderer; the ride engine and safety rails; the Passenger autopilot; Mera passkey login; AUSD balances and the Perpl margin flows; **direct onchain Perpl orders** (`execOrder`) with fills read from contract state; the Kuru spot lane; receipts with Monad tx links; the Node relay; the market-data feed; the verify scripts; `/about`.

Not included, and not part of this project: Ride the Now's 3D night drive and other modes, its multi-venue engine, its hedged desk, and its private backend. This repo calls no private service. Everything it runs is here.

## AI tools disclosure

This project was built with **Claude Code** (Anthropic), which wrote most of the new code under the author's direction. The author made the product and design decisions, reviewed the work, and places all live trades.

## Attribution

- **Mera** (`@category-labs/mera`, Apache-2.0 / MIT) for passkey → wallet derivation.
- **Perpl**: Exchange ABI fragments from [PerplFoundation/dex-sdk](https://github.com/PerplFoundation/dex-sdk) and protocol details from [PerplFoundation/api-docs](https://github.com/PerplFoundation/api-docs).
- **Kuru Flow** API ([docs.kuru.io](https://docs.kuru.io)) for spot routing.
- **Agora** AUSD ([docs.agora.finance](https://docs.agora.finance)).
- viem, @noble/ed25519, @noble/hashes, @scure/bip32, @scure/bip39, Next.js, Tailwind CSS, ws.
- Monad brand colours from the [Monad brand kit](https://monad.xyz/brand-and-media-kit).

## Licence

[AGPL-3.0](./LICENSE). If you run a modified version as a service, you must publish your source under the same licence.
