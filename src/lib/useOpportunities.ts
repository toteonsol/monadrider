"use client";
/**
 * Reads Perpl's public market state and posts timely, plain-words cards to the
 * pit radio: the day's biggest mover, funding that pays one side, and the
 * busiest book. At most one card per kind per market per hour.
 */
import { useEffect } from "react";
import { radio } from "./radio";
import { PERPL } from "./perpl/config";

type M = {
  name: string;
  config?: { price_decimals?: number };
  state?: { mid?: string | number; prv?: string | number; dva?: string };
  funding?: { rate?: number };
  funding_interval_sec?: number;
};

const pct = (x: number, dp = 2) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}%`;

export function scan(markets: M[]) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const rows = markets
    .map((m) => {
      const s = 10 ** (m.config?.price_decimals ?? 0);
      const mid = Number(m.state?.mid ?? 0) / s;
      const prv = Number(m.state?.prv ?? 0) / s;
      return {
        name: m.name,
        move: mid && prv ? ((mid - prv) / prv) * 100 : 0,
        fund: Number(m.funding?.rate ?? 0) / 1e4, // micros → percent
        every: Math.round((m.funding_interval_sec ?? 3600) / 60),
        vol: Number(m.state?.dva ?? 0),
      };
    })
    .filter((r) => r.name);

  const mover = [...rows].sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0];
  if (mover && Math.abs(mover.move) >= 2) {
    const up = mover.move > 0;
    radio(
      {
        kind: "opportunity",
        tone: "info",
        title: `${mover.name} ${pct(mover.move)} today on Perpl`,
        body: up
          ? `Buyers have had the day. Ride the crest with them, or wait in the line for the turn. Your clip and stop stay the same.`
          : `Sellers have had the day. The trough is where shorts ride it; a long here is a bet on the bounce. Your clip and stop stay the same.`,
        asset: mover.name,
      },
      `mover-${mover.name}-${hour}`,
    );
  }

  const fund = [...rows].sort((a, b) => Math.abs(b.fund) - Math.abs(a.fund))[0];
  if (fund && Math.abs(fund.fund) >= 0.003) {
    const longsPay = fund.fund > 0;
    radio(
      {
        kind: "opportunity",
        tone: "good",
        title: `Funding on ${fund.name}: ${longsPay ? "longs pay shorts" : "shorts pay longs"}`,
        body: `${pct(fund.fund, 4)} every ${fund.every} min. Holding the ${longsPay ? "trough (short)" : "crest (long)"} collects it while the position is open; the other side pays it.`,
        asset: fund.name,
      },
      `fund-${fund.name}-${hour}`,
    );
  }

  const busy = [...rows].sort((a, b) => b.vol - a.vol)[0];
  if (busy && busy.vol > 0) {
    radio(
      {
        kind: "opportunity",
        tone: "info",
        title: `${busy.name} is Perpl's busiest book today`,
        body: "The most volume means the most liquidity to fill against: your carves land closest to the price you see.",
        asset: busy.name,
      },
      `busy-${busy.name}-${Math.floor(hour / 4)}`,
    );
  }
}

export function useOpportunities() {
  useEffect(() => {
    let dead = false;
    const read = async () => {
      try {
        const r = await fetch(`/api/perpl/context${PERPL.isTestnet ? "?testnet=true" : ""}`);
        const d = (await r.json()) as { markets?: M[] };
        if (!dead && d.markets) scan(d.markets);
      } catch {}
    };
    const first = setTimeout(read, 4000); // let the page settle first
    const t = setInterval(read, 30_000);
    return () => {
      dead = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
}
