/**
 * 🏷 RIDER ALIASES · a name a person can remember, from the code they already have.
 *
 * The standings, the feed and the profile all spoke in rider codes —
 * "hra5zvqg", "hr0dd6de" — which are private by design (never a wallet) and
 * impossible to relate to. Nobody cheers for hr0dd6de.
 *
 * So every code gets a stable, friendly alias — "Papaya Falcon" — derived from
 * the code itself: the same rider is the same name on every screen and every
 * device, nothing is stored, nothing is chosen, and nobody can take someone
 * else's name because nobody chooses one. The code still rides alongside
 * (#hra5) so two riders who hash to the same words stay distinguishable.
 *
 * The word lists are deliberately warm and neutral — no combination can land
 * as an insult.
 */

const ADJ = [
  "Papaya", "Midnight", "Neon", "Turbo", "Silent", "Rapid", "Chrome", "Amber",
  "Velvet", "Solar", "Lunar", "Steady", "Bold", "Calm", "Swift", "Lucky",
  "Golden", "Crimson", "Cobalt", "Emerald", "Arctic", "Desert", "Harbor", "Summit",
  "Pixel", "Nova", "Echo", "Delta", "Copper", "Indigo", "Saffron", "Onyx",
  "Coral", "Jade", "Ivory", "Scarlet", "Hazel", "Opal", "Silver", "Canyon",
];
const NOUN = [
  "Falcon", "Comet", "Drifter", "Panther", "Fox", "Hawk", "Wolf", "Lynx",
  "Otter", "Racer", "Pilot", "Voyager", "Rocket", "Tiger", "Raven", "Heron",
  "Stag", "Bison", "Viper", "Orca", "Puma", "Kestrel", "Marlin", "Jaguar",
  "Condor", "Sparrow", "Badger", "Mustang", "Cheetah", "Dolphin", "Owl", "Eagle",
  "Gecko", "Ibis", "Mako", "Nomad", "Ranger", "Scout", "Glider", "Meteor",
];

/** FNV-1a · small, stable, good enough to spread codes across the lists */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface RiderAlias {
  /** "Papaya Falcon" */
  name: string;
  /** "#hra5" · the code's first four characters after the prefix */
  tag: string;
  /** 0–359 · the avatar's hue */
  hue: number;
  /** "PF" */
  initials: string;
}

const cache = new Map<string, RiderAlias>();

export function riderAlias(code: string): RiderAlias {
  const key = (code || "").toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(key);
  const a = ADJ[h % ADJ.length];
  const n = NOUN[Math.floor(h / ADJ.length) % NOUN.length];
  const out: RiderAlias = {
    name: `${a} ${n}`,
    tag: `#${key.replace(/^hr/, "").slice(0, 4) || "????"}`,
    hue: Math.floor(h / (ADJ.length * NOUN.length)) % 360,
    initials: `${a[0]}${n[0]}`,
  };
  cache.set(key, out);
  return out;
}
