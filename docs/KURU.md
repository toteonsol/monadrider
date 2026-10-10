# Kuru bounty write-up · Ride the Now on Monad

## The product in one line

A trading game for people who would never open a trading terminal. You surf the live price, every move is a real trade, and the spot lane on Kuru is where you **bank the ride**: own the asset you just surfed, or turn MON into AUSD to go live.

## Who it's for

| Segment | Who they are | What they get |
|---|---|---|
| **Curious newcomers** | Phone-first, crypto-curious, never placed a trade, scared off by seed phrases and order books | A passkey wallet in two taps, a free practice ride, then $5 trades with a stop on every ride |
| **Casual degens** | Already play 5-minute up/down markets and meme coins on a phone | A faster, more physical version of "up or down" with real fills and receipts |
| **MON holders** | Hold MON, want to do something with it | Sell MON for AUSD margin or buy more MON on Kuru without leaving the app |
| **Venues and wallets (B2B)** | Order books and wallets that want consumer flow | The feed + executor interface: plug a Monad order book in and get a front end where users arrive by playing |

## Evidence of demand

- **Short, game-like trading is where retail is going.** Polymarket's 5-minute crypto Up/Down markets launched in Feb 2026 and reached about 67% of its crypto up/down volume, with daily peaks of $60M+, while longer daily crypto markets were often under $1M a day ([Tekedia, Mar 2026](https://www.tekedia.com/short-term-crypto-markets-see-60m-of-daily-volume-on-polymarket/)).
- **Plain spot is cooling while event-style products explode.** Robinhood's July 2026 crypto notional volume was $10.9B, down 62% year over year, while event contracts traded rose 20x year over year to 6.1B ([FX News Group, Aug 2026](https://fxnewsgroup.com/forex-news/retail-forex/robinhood-sees-continued-slowdown-in-crypto-trading-33-in-july-2026/)).
- **Perps inside a consumer, mostly mobile wallet work.** Phantom's perps reached $39.4B in volume and 137,496 unique active wallets ([Solana Compass, Jun 2026](https://solanacompass.com/news/phantom-tops-hyperliquids-builder-program-with-206m-in-fees)).
- **Monad has the venue and the users.** Perps volume passed $2.5B in August 2026, a network record. DEX volume passed $3.64B for the month, across 4.2M+ wallets ([Monad, Sep 2026](https://monad.xyz/blog/monad-ecosystem-highlights-august-2026)).
- **Passkeys fix the drop-off.** Passkey sign-ins succeed 93% of the time vs. 63% for other methods, and take 8.5s instead of 31.2s ([FIDO Alliance Passkey Index, Oct 2025](https://fidoalliance.org/fido-alliance-launches-passkey-index-revealing-significant-passkey-uptake-and-business-benefits/)).
- **A caution from the same data:** bots dominate the 5- and 15-minute prediction markets. Casual users want the format but get a poor experience there. A game with real order-book fills, capped size and visible receipts is a fairer home for that demand.

## How it works with Kuru

- Spot swaps go through **Kuru Flow**: a quote returns the best route across Kuru's onchain books (MON/AUSD, MON/USDC) with `minOut`. The rider's passkey wallet signs and sends the swap from the tab.
- The receipt after every ride offers **"Bank it in MON · Kuru"**, so the perp game feeds spot volume.
- **Funding path:** a new rider who only holds MON sells some on Kuru for AUSD, then deposits it as Perpl margin, all in-app.

## Acquisition

1. **Share the ride.** Every receipt is a story with a number and Monad tx links. A share card and replay are next on the roadmap.
2. **Free practice as the top of the funnel.** No wallet is needed to play on live prices, so a link in a group chat lands straight in a ride.
3. **Ecosystem distribution.** Monad community quests, Perpl and Kuru co-marketing, and wallet embeds. The game can live inside other apps as an "in-app trading experience", one of Kuru's suggested ideas.
4. **Creator and stream mode.** Rides are visual and short, made for TikTok, Shorts and live streams.

## Retention

- **Short sessions with a clear end:** a ride lasts 1–10 minutes and ends with a receipt. It's a habit loop, not a terminal you leave open.
- **Streaks and daily rides** (roadmap): Duolingo credits streak mechanics with moving company-wide DAU, which reached 50.5M in Q3 2025, up 36% year over year.
- **Passenger:** the autopilot gives returning users something to do when they don't want to steer, inside the same rails.
- **Progress you can see:** ride history, live P&L and volume, and the move from practice to live to Passenger.
- **Trust as a retention feature:** stops, max loss and flatten-on-exit mean a bad day doesn't end someone's journey.

## Roadmap

| When | What |
|---|---|
| Now (hackathon) | Surfer, Passenger, Kuru spot lane, passkey wallet, AUSD margin, receipts with tx links |
| +1 month | Share cards and ride replays; daily ride and streaks; more Perpl markets; limit-order "banking" on Kuru (rest a bid under the wave) |
| +3 months | Leagues and friend challenges; embeddable ride widget for wallets and other apps; Kuru limit orders at ride targets |
| +6 months | Native wrappers (iOS/Android) around the PWA; more Monad venues through the executor interface; partner revenue via builder codes |
