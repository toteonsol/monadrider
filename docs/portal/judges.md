Live app: https://monadrider.ceoism.com (phone or desktop). No login is needed for practice.

1. Practice (free, 2 minutes): open the app, tap "Take a free lap" (or Play > the grid) and pick SURFER, RIDE or PULSE. Swipe or use arrow keys to change lanes. The worlds run on Perpl's live MON order book on Monad. Inside a world, tap "pit wall" (top right) for live market weather, sit-out and better-road pointers, and the bell for the pit radio.
2. Passkey wallet (Agora + Mera): Money > Create passkey wallet. Use Safari (iCloud Keychain), Android Chrome (Google Password Manager) or 1Password; desktop Chrome local passkeys can't derive a wallet. Fund the shown address with ~1 MON (gas) and 11+ AUSD, or swap MON > AUSD on Spot (Kuru). Deposit 10+ AUSD into Perpl from Money.
3. Live ride: Trade > choose "Passkey wallet" (or "My Perpl account" with a trade-only key from app.perpl.xyz/apikeys, guide at /guide) > keep the default $10 clip > Go live > pick a world. Each lane change is a Perpl order; fills pop up with MonadScan links. Exit the world for the receipt; Money > History is the Logbook. Withdraw and Send return everything.
Note: live trading follows Perpl's own region list (e.g. US/UK are blocked by Perpl); practice works everywhere.

Proof without trading: README tx table (Perpl account opened from a passkey wallet, deposit, withdraw, Passenger open/close) and `pnpm verify:onchain` (simulates an open + close against mainnet state). Repo: https://github.com/toteonsol/monadrider
