/**
 * Same-origin proxy for Perpl's PUBLIC market-data REST (candles, ticker, book).
 * Perpl sends no CORS header, so the browser reads it through here. Only
 * `v1/market-data/...` GETs pass; nothing authenticated goes through this route.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9_*\-]+$/;

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.length || !path.every((p) => SAFE.test(p))) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const testnet = new URL(req.url).searchParams.get("testnet") === "true";
  const base = testnet ? "https://testnet.perpl.xyz/api" : "https://app.perpl.xyz/api";
  try {
    const r = await fetch(`${base}/v1/market-data/${path.join("/")}`, { cache: "no-store" });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: {
        "content-type": "application/json",
        "Cache-Control": "public, max-age=5, stale-while-revalidate=20",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
}
