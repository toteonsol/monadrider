/**
 * What's coming · the road ahead, on the home screen and /about. Honest status
 * chips: live (shipped), next (building now), soon, later.
 */
const ITEMS: { s: "live" | "next" | "soon" | "later"; t: string; d: string }[] = [
  { s: "live", t: "The desk, v1", d: "Kuru spot + Perpl short on MON: earn funding, not direction. Carry, costs and break-even shown live." },
  { s: "live", t: "Pit wall + pit radio", d: "market weather, sit-out, better roads with the numbers, opportunity cards, coaching from your own rides." },
  { s: "next", t: "Live paper studies on Monad", d: "always-on paper studies on Perpl and Kuru books (funding extremes vs spot, the gap between two books, the unloved short) that publish findings while they run and seed the pit wall, so the app gets smarter every hour." },
  { s: "next", t: "Spot mode in SURFER", d: "ride MON spot on Kuru instead of a perp, for anyone who wants no leverage at all." },
  { s: "live", t: "Wallet switcher", d: "several passkey wallets (spend, save, desk), each with its own Logbook." },
  { s: "next", t: "Share cards + ride replays", d: "clip a drive with its real Monad txs on it, made for X, TikTok and streams." },
  { s: "soon", t: "Multi-market rides", d: "one drive, several Perpl markets: steer a basket instead of a single road." },
  { s: "soon", t: "Bank the ride", d: "one tap on a winning receipt sweeps the gain and buys MON on Kuru." },
  { s: "soon", t: "Kuru limit take-profits", d: "rest the exit on Kuru's book at your target instead of watching the screen." },
  { s: "soon", t: "Leagues + convoys", d: "ride with friends, weekly leagues, streak buys tied to the daily set." },
  { s: "later", t: "The desk across venues", d: "long one Monad perp venue, short another, as soon as a second Monad perp DEX opens its API." },
  { s: "later", t: "Native iOS + Android", d: "store apps around the same PWA, with push alerts from the pit radio." },
  { s: "later", t: "Ride widget for wallets", d: "any wallet or game can host a ride lane: Monad trading as an in-app experience." },
];

const CHIP = {
  live: "border-chart text-chart",
  next: "border-papaya text-papaya",
  soon: "border-sky text-sky",
  later: "border-steel text-flat",
} as const;

export function Roadmap() {
  return (
    <div className="mt-9 w-full">
      <div className="display text-[19px] font-black uppercase text-bone min-[900px]:text-[22px]">What&apos;s coming</div>
      <p className="mt-1 text-[12.5px] text-flat">a long-term build on Monad, not a weekend demo · what's shipped, what's next</p>
      <div className="mt-3 grid grid-cols-1 border-2 border-steel min-[640px]:grid-cols-2 min-[980px]:grid-cols-3">
        {ITEMS.map((x) => (
          <div key={x.t} className="border-b border-dashed border-hairline bg-ink-soft/60 px-4 py-3.5 min-[640px]:border-r">
            <div className="flex items-center gap-2">
              <span className={`display border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${CHIP[x.s]}`}>{x.s}</span>
              <span className="display text-[13.5px] font-bold text-bone">{x.t}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-flat">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
