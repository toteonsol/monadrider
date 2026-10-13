/**
 * Region check for live trading. Perpl does not serve some countries (its own
 * public `geo_block` list); this app honours that list for every live route.
 * Vercel supplies the visitor's country. Outside the list, the route also
 * issues a short-lived relay ticket (HMAC, 10 minutes) without which the
 * relay won't open Perpl's trading socket, so the relay can't be used to get
 * around Perpl's block from a listed country.
 */
import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

let cache: { at: number; list: string[] } | null = null;
async function blockList(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  try {
    const d = (await fetch("https://app.perpl.xyz/api/v1/pub/context", { cache: "no-store" }).then((r) => r.json())) as { geo_block?: string[] };
    cache = { at: Date.now(), list: (d.geo_block ?? []).map((c) => c.toUpperCase()) };
  } catch {
    cache = cache ?? { at: Date.now(), list: ["BY", "CU", "GB", "IR", "KP", "RU", "SY", "UA", "US"] };
  }
  return cache.list;
}

export async function GET(req: Request) {
  const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase() || null;
  const list = await blockList();
  const blocked = country ? list.includes(country) : false;
  const secret = process.env.RELAY_TICKET_SECRET;
  let ticket: string | null = null;
  if (!blocked && secret) {
    const exp = Date.now() + 10 * 60_000;
    ticket = `${exp}.${createHmac("sha256", secret).update(String(exp)).digest("base64url")}`;
  }
  return NextResponse.json({ country, blocked, ticket }, { headers: { "Cache-Control": "no-store" } });
}
