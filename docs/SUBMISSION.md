# Submission text (dashboard)

**Project:** Ride the Now · Monad edition
**Track:** Onchain Finance & Trading
**Bounties:** Agora (Best Mobile Trading App) · Kuru (Consumer Trading App) · Perpl (Best Use of Perpl's API)
**Repo:** _GitHub URL_ · **Live app:** _URL_ · **Demo:** _YouTube/Loom URL_ · **Agora cut:** _URL_

## Short description

A racing, surfing and rhythm game on Monad (three 3D worlds: RIDE, SURFER, PULSE) where every lane you hold is a real, capped perp order sent from a passkey wallet (Mera) straight to Perpl's Exchange contract, margined in AUSD. The worlds' weather is Perpl's live order book; Passenger is the hands-off bot; spot MON on Kuru banks the ride; a Paddock leaderboard counts live rides only after verifying their Monad txs.

## Core features

- **Passkey login (Mera):** a Monad wallet from Face ID or fingerprint. No seed phrase, no extension.
- **AUSD:** wallet balance; one-tap deposit into and withdrawal from Perpl margin; winnings swept back to the wallet.
- **Perpl, directly onchain:** every carve is an `Exchange.execOrder` IOC transaction from the user's wallet. Fills are read back from contract state, and every fill links to MonadScan.
- **Passenger:** an automation bot on Perpl (trend + live order-flow signal, hysteresis, minimum hold) inside hard risk rails (clip cap, stop, max loss, timer, throttle, flatten on every exit), ending with a P&L and risk receipt.
- **Kuru spot lane:** MON ↔ AUSD through Kuru Flow on Kuru's order books.
- **Three 3D worlds, one engine:** RIDE, SURFER and PULSE read Perpl's live order flow on Monad and steer the same live engine.
- **The Paddock:** next-move ladder for newcomers, daily set and streaks, standings verified onchain, 9 languages.
- **PWA:** installable, with a bottom tab bar and launch button on phones and a rail on desktop.

## Why Monad

400 ms blocks make a game whose controls are trades feel instant. About 260k gas per order (≈ $0.001) makes $5 positions sensible. Perpl's fully onchain book means the wave and its tape are real Monad transactions.

## Contracts used (Monad mainnet)

- Perpl Exchange `0x34B6552d57a35a1D042CcAe1951BD1C370112a6F`
- AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`
- Kuru MON/AUSD book `0x131a2e70a5b31a517a74b8c567149bc294470da9`, Kuru Flow `0xb3e6778480b2E488385E8205eA05E20060B813cb`

## Transaction hashes

_Fill in after the live demo:_ account open · deposit · carves (long/short/close) · Passenger run · Kuru swap · withdraw.

## Pre-existing work and AI disclosure

Built on the author's private Ride the Now (the Perpl client and relay, and the sound module), imported in labelled commits and listed in the README. Everything else was built during the hackathon. Built with Claude Code; disclosed in the README.
