# Ride the Now · Monad edition

**Drive the market. Ride it on Monad.**

A racing, surfing and rhythm game where every lane you hold is a real, capped perp trade on **Perpl**, sent straight to Perpl's Exchange contract on **Monad** from a wallet you open with a **passkey (Mera)**, margined in **AUSD (Agora)**. Bank the ride as spot MON on **Kuru**.

- **Track:** Onchain Finance & Trading
- **Bounties:** Agora (best mobile trading app), Kuru (consumer trading app), Perpl (best use of Perpl's API / automation)
- **Licence:** AGPL-3.0
- **Live app:** _added at submission_ · **Demo video:** _added at submission_

---

## The game

| | |
|---|---|
| **RIDE** | the 3D night drive in its Monad world. Left lane short, centre flat, right lane long. Red trucks are the market turning against you; green cars and coins gather where it is pushing. |
| **SURFER** | carve the live price swell. The lip is long, the trough is short; dolphins run with buyers, sharks with sellers, whale prints surface as gems. |
| **PULSE** | the rhythm tunnel. The tempo is Perpl's live order flow. |

All three worlds read **Perpl's live order book and trades on Monad** (order-flow imbalance, depth imbalance, taker flow) for their weather, and all three steer the **same live engine**: in practice they are free, and once armed every lane change is one Perpl order from the rider's own wallet.

Around them sits the Paddock: a next-move ladder for newcomers (free lap → passkey → AUSD → margin → live → Passenger), the pit board with volume clubs and a streak chain, the daily set, the live Paddock and Championship, and 9 languages.

| Tab | What happens | Onchain |
|---|---|---|
| **Play** | the hub and the three worlds · practice free, no wallet | — |
| **Trade** | the Perpl cockpit: market board, **you drive** or **Passenger**, safety rails, four readiness lights, go live into a world, a live pit wall | one `execOrder` (IOC) tx per lane change |
| **Spot** | buy or sell MON with AUSD through Kuru's onchain order book (Kuru Flow) | one swap tx (+ one approve the first time) |
| **Money** | passkey wallet, AUSD and MON, receive address, AUSD in and out of Perpl margin, ride history | `createAccount` / `depositCollateral` / `withdrawCollateral` |
| **You** | standings, points, your rides | — |

Every live ride ends with a **P&L and risk receipt**: net, volume, fees, max drawdown, stops hit, and every fill with its Monad transaction. A winning ride can send its winnings back to the wallet as AUSD in one tap.

**Receipts, not claims.** The Paddock's own server counts a ride as live only after checking its Monad transactions: each must be a successful call from the rider's wallet to Perpl's Exchange. Anything else scores as practice (capped at 150 points).

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
pnpm relay        # terminal 1 · Perpl relay + Paddock server on :8787
pnpm dev          # terminal 2 · app on http://localhost:3000
```

Practice mode works immediately with live Perpl prices. For live mode:

1. Open **Money** and create a passkey wallet. Passkeys need HTTPS or `localhost`, and a PRF-capable authenticator: iCloud Keychain (iOS 18+ / macOS), Google Password Manager (Android), or 1Password. Desktop Chrome with a local profile passkey does not support PRF.
2. Send a little **MON** (gas) and some **AUSD** to the wallet address, or swap MON → AUSD on **Spot**.
3. In **Money**, deposit at least 10 AUSD into Perpl. The first deposit opens your Perpl account.
4. Open **Trade**: pick a market, pick who drives, check the four lights, **go live**, pick a world.

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
| `NEXT_PUBLIC_GAME_API` | `http://localhost:8787` | the Paddock server (same process as the relay) |

### Deploy

- **App:** any Next.js host (Vercel). Set the env vars above.
- **Relay:** `relay/server.mjs` is a stateless Node socket pipe. `railway.json` runs it on Railway; set `ALLOWED_ORIGINS` to the app's origin. The same process serves the Paddock API (`/api/*`); set `GAME_DATA` to a persistent path. A Cloudflare Worker relay is in `workers/perpl-relay` (pre-existing, see below).

---

## Architecture

```
src/
  components/
    Game.tsx               the app: Paddock hub, tabs, worlds full screen, receipts
    TradeCockpit.tsx       Perpl cockpit: market, who drives, rails, readiness, live pit wall
    NowCard.tsx            the next-move ladder
    ThreeRide / SurfRide / PulseRide   the three 3D worlds (pre-existing)
    Money / Spot / History / ReceiptSheet / RiderHub
  lib/
    ride/useLiveBridge.ts  worlds' setTarget/flatten/real refs ⇄ the onchain engine
    ride/engine.ts         bands → positions, safety rails, executors
    ride/onchainExecutor.ts  each lane change = Exchange.execOrder from the passkey wallet
    ride/passenger.ts      autopilot: trend + Perpl tape flow, hysteresis, min hold
    game/liveFeed.ts       the worlds' feed, from Perpl's order book + trades on Monad
    game/backend.ts        client for the Paddock server
    wallet/mera.tsx        passkey → Monad account (Mera), balances
    perpl/onchain.ts       Exchange ABI: account, deposit, withdraw, execOrder, reads
    kuru.ts                Kuru Flow quote + swap
relay/
  server.mjs               Perpl socket relay (Perpl refuses browser origins)
  game.mjs                 the Paddock: rides, standings, streaks, onchain verification
scripts/                   verify scripts
```

The worlds talk to venues through two seams: a **feed** (mid, flow, tape) and three **refs** (`setTarget`, `flatten`, `real`). Perpl and Kuru are the first venues; any onchain order book on Monad can plug in the same way.

## Pre-existing foundation

This edition is built on **Ride the Now**, a private app by the same author. Per the hackathon rules, these parts existed before 1 Sep 2026 and are imported verbatim in clearly labelled commits ("Import … from Ride the Now (pre-existing, built before 1 Sep 2026)"):

| Imported | What it is |
|---|---|
| `components/ThreeRide.tsx`, `SurfRide.tsx`, `PulseRide.tsx` | the three 3D worlds (RIDE, SURFER, PULSE) |
| `components/GamePicker, ArcadeCards, PaddockNow, PointsBoard, HeroCar, AppNav, RaceProgress, RiderAvatar, AnimatedNumber, BroadcastLayer, LanguagePicker`, `brand/*`, `viz/*` | the Paddock hub pieces, navigation, icons, charts |
| `lib/game/{sfx, glb, sky, rideLog, riderName, riderNameRules, referral, bounties, clubs, milestones, ridePlanRules, aiCoach, claimedNames}`, `lib/share`, `lib/useDialog`, `lib/i18n` | game helpers, ride log, daily set, rider names, 9-language i18n |
| `lib/perpl/{config, agent, sign, wsClient}`, `app/api/perpl/context`, `workers/perpl-relay` | Perpl market context, Ed25519 API-key signing, trading-socket client, Cloudflare relay |
| `app/globals.rtn.css`, `public/{models, sky, tex, game, fonts}` | the Grand Prix design system and the worlds' assets (CC0 / CC-BY / OFL, see Attribution) |

Edits to imported files after the import (Monad copy, the live asset instead of ETH, Monad colours, the three-world arcade, the Monad nav) are in their own commits.

**Built during the hackathon (new work):** the Monad integration end to end. Mera passkey wallet; AUSD balances and Perpl margin flows; **direct onchain Perpl orders** (`execOrder`) with fills read from contract state; the **live bridge** that turns every world into an onchain Perpl trader; the ride engine and its safety rails; **Passenger** on Monad; the worlds' live feed from **Perpl's order book** on Monad; the **Paddock server** with onchain verification of live rides; the Perpl cockpit; the next-move ladder; Kuru spot; receipts with Monad tx links; the Monad livery and venue registry; the Node relay; verify scripts; `/about`.

**Not included (stays private):** the multi-venue trading layer and its 16-venue registry, the hedged desk, the research fleet, the Convex backend, the convoy, CityRide and Depot. This repo calls no private service. Everything it runs is here.

## AI tools disclosure

This project was built with **Claude Code** (Anthropic), which wrote most of the new code under the author's direction. The author made the product and design decisions, reviewed the work, and places all live trades.

## Attribution

- **Mera** (`@category-labs/mera`, Apache-2.0 / MIT) for passkey → wallet derivation.
- **Perpl**: Exchange ABI fragments from [PerplFoundation/dex-sdk](https://github.com/PerplFoundation/dex-sdk) and protocol details from [PerplFoundation/api-docs](https://github.com/PerplFoundation/api-docs).
- **Kuru Flow** API ([docs.kuru.io](https://docs.kuru.io)) for spot routing.
- **Agora** AUSD ([docs.agora.finance](https://docs.agora.finance)).
- viem, @noble/ed25519, @noble/hashes, @scure/bip32, @scure/bip39, Next.js, Tailwind CSS, ws.
- Monad brand colours from the [Monad brand kit](https://monad.xyz/brand-and-media-kit).
- 3D models: Kenney and Quaternius (CC0, via kenney.nl and poly.pizza), full list in `public/models/LICENSES.md`; "Bear" by Nyilonelycompany ([Sketchfab](https://sketchfab.com/3d-models/bear-ce0d5eb86cf5459bb6bd20244cb44b27)), CC-BY 4.0, compressed for the web. Skies and textures: Poly Haven (CC0). Fonts: Unbounded, Archivo, Geist Mono (SIL OFL 1.1).
- three.js, framer-motion.

## Licence

[AGPL-3.0](./LICENSE). If you run a modified version as a service, you must publish your source under the same licence.
