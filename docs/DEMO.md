# Demo scripts

Record on a real phone. Screen-record, with the app installed to the home screen. Keep MonadScan open in a second tab to show the txs.

## Main demo (≤ 3:00)

| Time | Show | Say |
|---|---|---|
| 0:00 | The Paddock hub, then the grid of three worlds | "Drive the market. Every lane you hold is a real trade on Perpl, on Monad: long, flat or short." |
| 0:15 | Money → Create passkey wallet (Face ID) | "No seed phrase. Mera derives a Monad wallet from my passkey." |
| 0:30 | Balances: AUSD + MON | "I hold AUSD, Agora's dollar." |
| 0:40 | Spot: sell MON → AUSD on Kuru, tx link | "Need more margin? Swap on Kuru's order book without leaving." |
| 0:55 | Money: deposit AUSD into Perpl, tx link | "One tap moves AUSD into Perpl margin." |
| 1:10 | Trade → four green lights → Go live → pick SURFER (or RIDE). Carve to the lip, then the trough | "The lip is long, the trough is short. Each carve is an execOrder transaction from my wallet, settled in under a second." |
| 1:45 | Exit the world → the P&L and risk receipt | "Stops, max loss and a timer are on. Every exit flattens, and the receipt lists every Monad tx." |
| 2:00 | Tap a fill tx → MonadScan | "Every fill is a Monad transaction." |
| 2:15 | Trade → Passenger → Go live → RIDE drives itself; the cockpit's signal gauge | "Passenger is the hands-off bot: trend plus Perpl's live order flow, same rails, and a P&L and risk receipt." |
| 2:45 | Receipt → Send winnings to wallet | "Winnings go back to the wallet as AUSD." |

## Agora cut (≤ 2:00)

Passkey login (0:00–0:25) → AUSD balance and funding (0:25–0:55) → deposit to Perpl (0:55–1:10) → live carve with tx link (1:10–1:45) → receipt (1:45–2:00).

## Perpl cut (optional, ≤ 2:00)

Passenger live run on MON → signal gauge → receipt with fills, fees, max drawdown and stops → MonadScan txs → `pnpm verify:onchain` output.
