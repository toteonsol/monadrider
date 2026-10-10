/**
 * VenueMark · bespoke line-art glyphs for each venue, replaces the generic
 * emojis. One consistent stroke language (24×24, 2px, round caps), drawn in
 * currentColor so each can be tinted to its world colour. Abstract, not logos:
 * a motif that reads at a glance.
 */
import type { VenueId } from "@/lib/game/venues";
// re-exported so this file's importers need not change · ONE definition, in
// the registry. A parallel copy here would drift the first time a road ships
// and only its glyph got added.
export type { VenueId };

const PATHS: Record<VenueId, React.ReactNode> = {
  // fast forward chevrons, deep, liquid speed
  hyperliquid: (
    <>
      <path d="M4 6l7 6-7 6" />
      <path d="M12 6l7 6-7 6" />
    </>
  ),
  // flame, hot
  hotstuff: (
    <path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 .5-3-1-5 0-7z" />
  ),
  // clean lightning bolt
  lighter: <path d="M13 3L5 13h5l-1 8 8-11h-5l1-7z" />,
  lightermain: <path d="M13 3L5 13h5l-1 8 8-11h-5l1-7z" />,
  // orbit rings, perpetual / Monad
  perpl: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
    </>
  ),
  // expand brackets, extended reach
  extended: (
    <>
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M9 20H4v-5" />
      <path d="M15 20h5v-5" />
      <path d="M8 12h8" />
    </>
  ),
  // ocean wave, Ondo
  ondo: (
    <>
      <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </>
  ),
  // rising phoenix flame, Phoenix
  phoenix: (
    <>
      <path d="M12 21c-4 0-6-2.5-6-5.5C6 12 9 10 9 6c0 0 2 1.5 2.5 4C13 8 12 4 12 3c2 2 5 5 5 9 0 3.5-1 5-2 6 2-1 3-2.5 3-4.5" />
    </>
  ),
  // the arc · Arcus, drawn as a rising bow over its chord
  arcus: (
    <>
      <path d="M3 17a9 9 0 0 1 18 0" />
      <path d="M3 17h18" />
      <circle cx="12" cy="17" r="1.6" />
    </>
  ),
  // N1 · the numeral one standing on Solana's three bars
  n1: (
    <>
      <path d="M12 4v10" />
      <path d="M9 7l3-3" />
      <path d="M4 17h16" />
      <path d="M5 20h14" />
    </>
  ),
  // Nado · a tornado: three shrinking bars, the funnel of the storm
  nado: (
    <>
      <path d="M4 6h16" />
      <path d="M7 11h10" />
      <path d="M10 16h4" />
      <path d="M12 16v4" />
    </>
  ),
  // RISEx · a rising step-line, the chain that runs the book on-chain
  risex: (
    <>
      <path d="M4 18h5v-5h5V8h6" />
      <path d="M17 5l3 3-3 3" />
    </>
  ),
  // Polymarket Perps · a probability bar that became a price line
  polyperps: (
    <>
      <path d="M4 16h16" />
      <path d="M4 8h9" />
      <path d="M16 5l4 3-4 3" />
    </>
  ),
  // Kalshi · a regulated pillar: the column with the cap
  kalshi: (
    <>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
      <path d="M7 19h10" />
      <path d="M8 9l-3 4M16 9l3 4" />
    </>
  ),
  // BULK · three stacked slabs, a bulk load · the venue's name, drawn
  bulk: (
    <>
      <rect x="4" y="4.5" width="16" height="4" rx="1" />
      <rect x="4" y="10" width="16" height="4" rx="1" />
      <rect x="4" y="15.5" width="16" height="4" rx="1" />
    </>
  ),
  // a folded proof · two paths converging to one verified point (Starknet)
  paradex: (
    <>
      <path d="M5 5v14" />
      <path d="M5 5l8 5-8 5" />
      <path d="M13 10h6" />
    </>
  ),
};

export default function VenueMark({
  venue,
  size = 20,
  className = "",
}: {
  venue: VenueId;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={venue}
    >
      {PATHS[venue]}
    </svg>
  );
}
