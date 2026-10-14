import type { Metadata } from "next";
import { AUSD, PERPL_EXCHANGE, addressUrl } from "@/lib/monad";
import { KURU_MON_AUSD } from "@/lib/kuru";
import { Roadmap } from "@/components/Roadmap";

export const metadata: Metadata = {
  title: "How it works · Monad Rider",
  description: "A trading game where the live price is a wave and every carve is a real Perpl trade on Monad.",
};

const FLOW = [
  { k: "Passkey", v: "Mera derives a Monad wallet from your Face ID or fingerprint. No seed phrase, no extension." },
  { k: "AUSD", v: "Agora's dollar sits in that wallet. Swap MON for it on Kuru without leaving the app." },
  { k: "Margin", v: "One tap moves AUSD into Perpl, Monad's onchain perp exchange." },
  { k: "Carve", v: "Swipe up or down. The app signs an order in your tab and sends it to Perpl's Exchange contract." },
  { k: "Receipt", v: "Each fill links to its Monad transaction. The chain is the record." },
];

const WHY_MONAD = [
  ["~400 ms blocks", "A carve settles before your thumb lifts, so the wave and your position never drift apart."],
  ["≈ $0.001 per order", "About 260k gas per IOC order makes $5 trades sensible, so a newcomer can learn with pocket change."],
  ["Fully onchain book", "Perpl matches on Monad itself. The tape you surf is made of real Monad transactions."],
  ["EVM, plain EOAs", "A passkey-derived EOA can sign everything: perps on Perpl, spot on Kuru, AUSD transfers."],
];

export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(24px+var(--safe-top))]">
      <a href="/" className="label hover:text-lavender">
        ← Back to the wave
      </a>
      <h1 className="font-display mt-4 text-4xl font-bold leading-tight sm:text-5xl">
        The market is a wave.
        <br />
        <span className="text-monad">Ride it on Monad.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-lavender/90">
        Monad Rider turns trading into a game you already understand. The live price draws the wave: ride the crest and
        you&apos;re long, drop into the trough and you&apos;re short. Every move is a real, capped trade on Perpl, settled on
        Monad, funded in AUSD, with a passkey for a wallet.
      </p>

      <Section title="One carve, end to end">
        <ol className="grid gap-2 sm:grid-cols-5">
          {FLOW.map((f, i) => (
            <li key={f.k} className="card px-4 py-3">
              <div className="num text-xs text-monad">0{i + 1}</div>
              <div className="font-display mt-1 font-bold">{f.k}</div>
              <p className="mt-1 text-sm text-lavender/80">{f.v}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Why it only works on Monad">
        <div className="grid gap-2 sm:grid-cols-2">
          {WHY_MONAD.map(([k, v]) => (
            <div key={k} className="card px-4 py-3">
              <div className="font-display font-bold text-cyan">{k}</div>
              <p className="mt-1 text-sm text-lavender/80">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Three ways to ride">
        <div className="grid gap-2 sm:grid-cols-3">
          <Card k="Surfer" v="You steer. Swipe, or use the three thumb buttons. Practice is free; live trades Perpl." />
          <Card k="Passenger" v="The autopilot steers on trend plus Perpl's live order flow, inside the same safety rails. Every run ends with a P&L and risk receipt." />
          <Card k="Spot" v="Bank the ride: buy or sell MON with AUSD on Kuru's onchain order book." />
        </div>
      </Section>

      <Section title="Safety rails on every ride">
        <ul className="card space-y-1.5 px-5 py-4 text-sm text-lavender/90">
          <li>· Clip cap: every position is the same small size, hard-capped at $100.</li>
          <li>· Stop: a position that moves past your stop against you closes (a wipeout).</li>
          <li>· Max loss: the ride ends itself when net P&L hits your limit.</li>
          <li>· Timer and throttle: rides end on time, and a twitchy thumb can&apos;t churn fees.</li>
          <li>· Flatten on every exit: end, stop, max loss, or simply leaving the screen.</li>
          <li>· Keys stay in your tab: the passkey wallet key lives in memory and is zeroed on lock.</li>
        </ul>
      </Section>

      <Section title="For venues and partners">
        <div className="card px-5 py-4 text-sm leading-relaxed text-lavender/90">
          <p>
            The game speaks to venues through two small interfaces: a <em>feed</em> (a price series plus a trade tape) and an{" "}
            <em>executor</em> (open, close). Any onchain order book on Monad can plug in and get a consumer front end whose
            users arrive by playing, not by reading a depth chart. Perpl and Kuru are the first two.
          </p>
          <p className="mt-2">The code is open source under AGPL-3.0.</p>
        </div>
      </Section>

      <Roadmap />

      <Section title="Contracts on Monad mainnet">
        <div className="card divide-y divide-line px-5 text-sm">
          <Row k="Perpl Exchange" a={PERPL_EXCHANGE} />
          <Row k="AUSD (Agora)" a={AUSD.address} />
          <Row k="Kuru MON/AUSD order book" a={KURU_MON_AUSD} />
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="font-display font-bold">{k}</div>
      <p className="mt-1 text-sm text-lavender/80">{v}</p>
    </div>
  );
}

function Row({ k, a }: { k: string; a: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span>{k}</span>
      <a href={addressUrl(a)} target="_blank" rel="noreferrer" className="num truncate text-cyan">
        {a.slice(0, 10)}…{a.slice(-6)} ↗
      </a>
    </div>
  );
}
