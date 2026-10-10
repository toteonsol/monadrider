/**
 * Perpl API-key store · the venue's trade-only credential.
 *
 * A Perpl key is an Ed25519 pair enrolled once by a wallet signature (on Perpl's
 * own /apikeys page, or in-app once our origin is whitelisted). It is TRADE-ONLY
 *, it can place & cancel orders but CANNOT withdraw ("Withdrawals and
 * transfers-out are never permitted via an API key"). We store the opaque
 * X-API-Key token + the Ed25519 private key, namespaced per L1 wallet, in
 * localStorage. We never touch the user's L1 wallet key.
 */

export interface PerplKey {
  apiKey: string; // opaque X-API-Key token
  privateKey: string; // Ed25519 private key hex (trade-only signer)
}

const KEY = (l1: string) => `rtn-perpl-key-${l1.toLowerCase()}`;

export function loadPerplKey(l1Address: string): PerplKey | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY(l1Address));
    return raw ? (JSON.parse(raw) as PerplKey) : null;
  } catch {
    return null;
  }
}

export function savePerplKey(l1Address: string, k: PerplKey): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(l1Address), JSON.stringify(k));
}

export function clearPerplKey(l1Address: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY(l1Address));
}
