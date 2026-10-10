/**
 * referral · points-first referral program (v1, client-side capture).
 *
 * ?ref=CODE on any link is captured once and persisted. Referred riders get a
 * permanent +10% points boost (their incentive to use a link). The REFERRER's
 * cut (10% of referee points) needs the global backend to credit · the code
 * is captured in every ride record now so history counts retroactively when
 * the leaderboard ships. Points-only by design: sharing actual fees requires
 * money transmission we should not touch this early.
 */

const REF_KEY = "rtn-ref"; // who referred me
const CODE_KEY = "rtn-mycode"; // my own invite code

export function captureRef() {
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && !localStorage.getItem(REF_KEY) && ref !== myCode())
      localStorage.setItem(REF_KEY, ref.slice(0, 24));
  } catch {
    /* SSR / blocked storage */
  }
}

export function referredBy(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/* ── WHO IS A RIDER, REALLY? ──────────────────────────────────────────────
   This code is a random string in localStorage. That makes one browser one
   rider — which is wrong in both directions:

     · clearing the cache forks you into a BRAND NEW rider, so a single person
       appears on the leaderboard many times over (35 codes exist today, most
       with no real volume, and a great many of them are one person)
     · ten wallets in one browser collapse into ONE rider, so a person running
       separate accounts cannot see them apart

   A WALLET is the durable identity. When one is connected we derive the rider
   id from it, so the same wallet is the same rider on any device and through
   any number of cache clears. The random code remains for practice rides,
   where there is no wallet and nothing to tie to. */
export function riderIdFor(address?: string | null): string {
  if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) {
    // short, stable, and derived — not the address itself, which does not
    // belong on a public leaderboard
    const a = address.toLowerCase();
    let h = 0;
    for (let i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
    return "hw" + h.toString(36).padStart(6, "0").slice(0, 6);
  }
  return myCode();
}

export function myCode(): string {
  try {
    let c = localStorage.getItem(CODE_KEY);
    if (!c) {
      c = "hr" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(CODE_KEY, c);
    }
    return c;
  } catch {
    return "hr";
  }
}

export function inviteLink(): string {
  return `${location.origin}/?ref=${myCode()}`;
}

/**
 * Bind identity to the wallet: once a wallet connects, the rider code becomes
 * deterministic from the address ("hr" + last 6). Same wallet = same identity
 * on any device/browser · stats, leaderboard rank and referral earnings follow
 * the wallet instead of evaporating with localStorage.
 */
export function bindWalletCode(address: string): void {
  try {
    if (!address?.startsWith("0x")) return;
    const walletCode = "hr" + address.slice(-6).toLowerCase();
    if (localStorage.getItem(CODE_KEY) !== walletCode)
      localStorage.setItem(CODE_KEY, walletCode);
  } catch {
    /* private mode */
  }
}

/** +10% points while referred · applied inside computePoints. */
export const REFERRED_BOOST = 1.1;
