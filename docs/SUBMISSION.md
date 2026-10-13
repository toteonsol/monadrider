# Submission text (dashboard)

**Project:** Ride the Now · Monad edition
**Track:** Onchain Finance & Trading
**Bounties:** Agora (Best Mobile Trading App) · Kuru (Consumer Trading App) · Perpl (Best Use of Perpl's API)
**Repo:** https://github.com/toteonsol/monadrider · **Live app:** https://ride-the-now-monad.vercel.app · **Demo:** _YouTube/Loom URL_ · **Agora cut:** _URL_

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

| What | Monad tx |
|---|---|
| Passkey wallet (Mera) opens a Perpl account with AUSD (`createAccount`) | [`0x9511a628…1e7a`](https://monadscan.com/tx/0x9511a628e61027ee46d4246d55377d84ff3dad05445ab433b3c15cf4c4971e7a) |
| Withdraw AUSD from Perpl back to the wallet (`withdrawCollateral`) | [`0x8a1a2ec4…e014`](https://monadscan.com/tx/0x8a1a2ec48c3a344b473dc6975bb3df879b70e895812e675c16daa693cdbce014) |
| Deposit AUSD again (`depositCollateral`) | [`0x963bb3da…feda`](https://monadscan.com/tx/0x963bb3dac1c54ecbebd0e5c77dfb4c7f71db5199c278cb331b0e973eacb2feda) |
| Passenger opens a BTC position, sent from the passkey wallet (`execOrder`) | [`0x6176e727…4176`](https://monadscan.com/tx/0x6176e727112cd4495ae6f019f3eb7aa1d55995f0de8f2a813092862493ea4176) |
| Passenger closes it (`execOrder`) | [`0x37465d43…d4d7`](https://monadscan.com/tx/0x37465d43aa2ad0e024a5b34df22959dbf7bfebd3ec44f4a0340f2cc622f4d4d7) |

Passkey wallet: [`0x7fa5861fec8aa0cfce0e504cbd0ff297c32b236a`](https://monadscan.com/address/0x7fa5861fec8aa0cfce0e504cbd0ff297c32b236a) (Perpl account #5483). Its Kuru MON → AUSD swap is on the same MonadScan page. Live rides from an existing Perpl account (API-key route) were also run; those orders are forwarded onchain by Perpl.

## Pre-existing work and AI disclosure

Built on the author's private Ride the Now (the Perpl client and relay, and the sound module), imported in labelled commits and listed in the README. Everything else was built during the hackathon. Built with Claude Code; disclosed in the README.
