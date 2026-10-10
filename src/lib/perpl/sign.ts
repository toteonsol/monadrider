/**
 * Perpl request signing · Ed25519 over canonical strings.
 *
 * Every authenticated Perpl call is signed with the API key's Ed25519 private
 * key, no bearer token, no cookie. Two canonical-string shapes:
 *   - REST: [chain_id, METHOD, request-target, timestamp_ms, nonce, sha256(body)hex]
 *   - WS sign-in: [chain_id, "trading-ws-signin", timestamp_ms, nonce]
 * joined by "\n"; the signature is base64url(ed25519(canonical)), no padding.
 *
 * Spec: api-docs/authentication.md.
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { PERPL } from "./config";

// @noble/ed25519 v3 ships hashless (dependency-free) · wire sha512 once so
// signAsync/getPublicKeyAsync work in the browser and in Node.
ed.hashes.sha512 = sha512;

const enc = new TextEncoder();

/** base64url with NO padding · used for signatures and nonces. */
export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** 16 random bytes → base64url · a fresh single-use nonce per signed request. */
export function newNonce(): string {
  return b64url(ed.etc.randomBytes(16));
}

/** Generate a fresh Ed25519 API keypair. Secret stays on the client forever. */
export async function generateApiKeypair(): Promise<{ secretHex: string; publicKeyHex: string }> {
  const sk = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(sk);
  return { secretHex: toHex(sk), publicKeyHex: "0x" + toHex(pk) };
}

const skBytes = (secretHex: string) =>
  ed.etc.hexToBytes(secretHex.startsWith("0x") ? secretHex.slice(2) : secretHex);

/** Sign an arbitrary message (raw bytes) with the API secret → base64url sig. */
export async function signB64url(secretHex: string, message: Uint8Array): Promise<string> {
  return b64url(await ed.signAsync(message, skBytes(secretHex)));
}

/** Sign an arbitrary message → 0x-hex sig (used for enrollment proof-of-possession). */
export async function signHex(secretHex: string, message: Uint8Array): Promise<string> {
  return "0x" + toHex(await ed.signAsync(message, skBytes(secretHex)));
}

export interface RestAuthHeaders {
  "X-API-Key": string;
  "X-API-Timestamp": string;
  "X-API-Nonce": string;
  "X-API-Signature": string;
}

/** Build the four signed headers for a REST call. `target` is the path+query
 *  EXACTLY as sent (e.g. "/v1/trading/fills?count=100"); `body` is the raw
 *  request body string ("" for GET). */
export async function restAuthHeaders(
  apiKey: string,
  secretHex: string,
  method: string,
  target: string,
  body = ""): Promise<RestAuthHeaders> {
  const timestamp = Date.now().toString();
  const nonce = newNonce();
  const bodyHash = toHex(sha256(enc.encode(body)));
  const canonical = [PERPL.chainId, method, target, timestamp, nonce, bodyHash].join("\n");
  return {
    "X-API-Key": apiKey,
    "X-API-Timestamp": timestamp,
    "X-API-Nonce": nonce,
    "X-API-Signature": await signB64url(secretHex, enc.encode(canonical)),
  };
}

/** Build the `ApiKeySignIn` (mt:29) frame that must be the FIRST WS message. */
export async function wsSignInFrame(apiKey: string, secretHex: string) {
  const timestamp = Date.now().toString();
  const nonce = newNonce();
  const canonical = [PERPL.chainId, "trading-ws-signin", timestamp, nonce].join("\n");
  return {
    mt: 29,
    chain_id: PERPL.chainId,
    api_key: apiKey,
    timestamp,
    nonce,
    signature: await signB64url(secretHex, enc.encode(canonical)),
  };
}
