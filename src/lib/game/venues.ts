/**
 * Venue registry, Monad edition. The private game rides many venues; this one
 * rides two, both on Monad: Perpl for perps (every carve) and Kuru for spot
 * (banking a ride, funding margin). Same shape the imported panels read.
 */
export type VenueId = "perpl" | "kuru";

export interface VenueMeta {
  label: string;
  kind: "perps" | "spot";
  chainId: number;
  appUrl: string;
  what: string;
}

export const VENUES: Record<VenueId, VenueMeta> = {
  perpl: {
    label: "Perpl",
    kind: "perps",
    chainId: 143,
    appUrl: "https://app.perpl.xyz",
    what: "fully onchain perp order book on Monad · margined in AUSD",
  },
  kuru: {
    label: "Kuru",
    kind: "spot",
    chainId: 143,
    appUrl: "https://www.kuru.io",
    what: "onchain spot order book on Monad · MON/AUSD",
  },
};

/** perp venues a ride can trade on (the nudges' "roads") */
export const VENUE_COUNT = 1;
export const venueMeta = (v: VenueId) => VENUES[v];
