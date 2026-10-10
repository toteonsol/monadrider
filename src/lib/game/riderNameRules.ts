/**
 * 🏷 CLAIMED RIDER NAMES · the rules, in one place, shared by the app (to
 * say what is wrong before anyone signs) and the server (convex/riderNames,
 * which enforces them — the app's check is courtesy, the server's is law).
 *
 * A rider may trade their generated alias ("Papaya Falcon #hra5") for a name
 * they choose. Choosing opens impersonation, so a claim is SIGNED: the wallet
 * signs one plain message naming the rider code and the name; the server
 * recovers the signer, refuses a name another rider holds, and lets only the
 * wallet that claimed a code ever rename it. Pure, no imports — safe in both
 * the browser and a Convex function.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 20;
/** a claim is valid for this long after it was signed */
export const CLAIM_TTL_MS = 10 * 60_000;

/* names that would pass for the product, the team or a venue */
const RESERVED = [
  "hyperider", "airdropsea", "admin", "administrator", "support", "official", "moderator", "staff", "team",
  "system", "root", "security", "helpdesk", "hyperliquid", "lighter", "arcus", "paradex", "privy",
];
/* kept short and plain · a claim is public on every leaderboard */
const BLOCKED = [
  "fuck", "shit", "cunt", "nigg", "fag", "rape", "nazi", "hitler", "porn", "dick", "cock", "pussy", "bitch",
  "whore", "slut", "kike", "spic", "chink", "retard", "anal", "penis", "vagina",
];

/** tidy what was typed: trim, one space between words */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** null when the name is fine, else the reason in plain words */
export function nameProblem(raw: string): string | null {
  const n = tidyName(raw);
  if (n.length < NAME_MIN) return `at least ${NAME_MIN} characters`;
  if (n.length > NAME_MAX) return `at most ${NAME_MAX} characters`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(n)) return "letters, numbers, spaces, - _ and . only, starting with a letter or number";
  const low = n.toLowerCase();
  const squashed = low.replace(/[^a-z0-9]/g, "");
  if (/^0x[0-9a-f]{4,}/.test(low)) return "that looks like a wallet address";
  if (/^h[rw][0-9a-z]{4,}$/.test(squashed)) return "that looks like a rider code";
  if (RESERVED.some((r) => squashed === r || squashed.startsWith(r))) return "that name is reserved";
  if (BLOCKED.some((b) => squashed.includes(b))) return "pick a different name";
  return null;
}

/** the exact text a wallet signs · built the same way on both sides */
export function claimMessage(p: { code: string; name: string; address: string; issuedAt: number }): string {
  return [
    "Hyperider · claim my rider name",
    "",
    `name: ${tidyName(p.name)}`,
    `rider: ${p.code.toLowerCase()}`,
    `wallet: ${p.address.toLowerCase()}`,
    `issued: ${new Date(p.issuedAt).toISOString()}`,
    "",
    "This only sets a display name. It moves no funds and grants nothing.",
  ].join("\n");
}
