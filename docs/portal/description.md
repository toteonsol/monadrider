Monad Rider (Ride the Now, Monad edition) makes perpetual futures as easy as driving a car.

THE PROBLEM
Perps are the biggest market in crypto and the least approachable. A newcomer has to learn order books, leverage, margin, liquidation and a seed phrase before placing one trade, and most quit before the first. The people who do stay are left alone with a terminal and no one telling them when conditions turn against them.

WHAT WE BUILT
A mobile-first trading game where the controls ARE the trades. Three 3D worlds read Perpl's live order book on Monad:
- RIDE, a night drive: left lane short, centre flat, right lane long. Red trucks are the market turning against you; green cars gather where it pushes.
- SURFER: carve the live price swell. The lip is long, the trough is short; dolphins run with buyers, sharks with sellers.
- PULSE: a rhythm tunnel whose tempo is Perpl's order flow.
Every lane change is a real, capped Perpl order, settled on Monad in under a second.

HOW IT USES MONAD (every piece is live on mainnet)
- Passkey wallet (Mera): Face ID or a fingerprint derives a Monad account. No seed phrase, no extension, no custodian. The key lives only in the tab and signs every carve with no pop-ups.
- AUSD (Agora): the wallet's dollar and Perpl's margin. Deposit and withdraw in one tap; winnings sweep back to the wallet; send anywhere.
- Perpl, directly onchain: lane changes become Exchange.execOrder (IOC) transactions from the user's own wallet, so every carve is the user's Monad tx (~260k gas, about $0.001). Fills are read back from contract state, not trusted from the client.
- Or an existing Perpl account: a trade-only API key (cannot withdraw, kept in the browser), with Perpl forwarding each order onchain.
- Kuru: spot MON <-> AUSD through Kuru's onchain order book, to bank a ride or fund margin.
Why Monad: 400 ms blocks make a game whose controls are trades feel instant; sub-cent gas makes $5 positions sensible; and Perpl's fully onchain book means the wave you surf is made of real Monad transactions.

NOT A PASSIVE GAME: THE SMART LAYER
- Pit wall, live in every world: spread, round-trip cost (spread + two taker fees), 30-second swing and funding for the road you're on, judged CALM / CHOPPY / STORM against your own stop, in plain words ("moves are smaller than the 14 bps round trip: hold a lane longer"). One tap to SIT OUT a storm (flatten and keep playing), one to come back.
- Better roads: other Perpl markets that are cheaper or moving more, with the numbers ("BTC spread 1.0 bps vs 7.4 on MON"), and a switch.
- Pit radio: opportunity cards from Perpl's live market state (biggest mover, funding that pays one side, busiest book) with "ride this"; every fill with its Monad tx; stops, take-profits, ride summaries; coaching tips drawn from what your ride actually did.
- Passenger: an automation bot (trend + live tape flow, hysteresis, minimum hold) that drives for you inside the same rails, while you watch the pit wall and can step in at any moment. It is hands-off, not hands-tied.
- Safety rails on every ride: capped clip (max $100), stop, take-profit, max loss, timer, order throttle, and flatten on every exit including leaving the screen. You can't blow up.

PROOF, NOT CLAIMS
- Every receipt lists each fill with its MonadScan link; the Logbook keeps every ride, swap, deposit, withdrawal and send with totals (volume, net, cost per $1M, win rate, onchain txs).
- The Paddock leaderboard counts a ride as live only after its own server verifies each named tx onchain (the rider's own Exchange call, or a forwarded order whose logs name the rider's Perpl account).
- pnpm verify:onchain simulates an open + close against mainnet state; pnpm verify:engine tests every rail.
- Mainnet txs from the app: Perpl account opened from a passkey wallet 0x9511a628e61027ee46d4246d55377d84ff3dad05445ab433b3c15cf4c4971e7a; withdraw 0x8a1a2ec48c3a344b473dc6975bb3df879b70e895812e675c16daa693cdbce014; deposit 0x963bb3dac1c54ecbebd0e5c77dfb4c7f71db5199c278cb331b0e973eacb2feda; Passenger open 0x6176e727112cd4495ae6f019f3eb7aa1d55995f0de8f2a813092862493ea4176 and close 0x37465d43aa2ad0e024a5b34df22959dbf7bfebd3ec44f4a0340f2cc622f4d4d7.

BUILT FOR PEOPLE, NOT TERMINALS
Mobile-first PWA with thumb-zone controls, a next-move ladder for newcomers (free lap > passkey > AUSD > margin > live > Passenger), daily set and streaks, an illustrated guide, 9 languages, and clippable drives for social media. Practice is free and needs no wallet; live trading honours Perpl's own region rules.

OPEN SOURCE
AGPL-3.0, self-contained (app, relay, game server and verify scripts). Built on the author's pre-existing Ride the Now game engine (labelled import commits, listed in the README); the entire Monad layer is new. Built with Claude Code (disclosed in the README).

Contracts (Monad mainnet): Perpl Exchange 0x34B6552d57a35a1D042CcAe1951BD1C370112a6F · AUSD 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a · Kuru MON/AUSD 0x131a2e70a5b31a517a74b8c567149bc294470da9 · Kuru Flow 0xb3e6778480b2E488385E8205eA05E20060B813cb
