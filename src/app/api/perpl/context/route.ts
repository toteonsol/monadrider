/**
 * Perpl public market-context proxy · same-origin so the browser can read it.
 *
 * Perpl's `/api/v1/pub/context` returns 200 but sends NO CORS header, so a
 * direct browser fetch from our origin is blocked ("Failed to fetch"). This
 * server-side route fetches it for us and relays the JSON same-origin. Public
 * data only (no auth, no secrets), the WS handles authed orders directly.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const testnet = new URL(req.url).searchParams.get("testnet") === "true";
  const base = testnet
    ? "https://testnet.perpl.xyz/api"
    : "https://app.perpl.xyz/api";
  try {
    const r = await fetch(`${base}/v1/pub/context`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `perpl ${r.status}` }, { status: 502 });
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=2, stale-while-revalidate=8" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 });
  }
}
