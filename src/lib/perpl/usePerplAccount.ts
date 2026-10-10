"use client";
import { useCallback, useEffect, useState } from "react";
import { publicClient } from "@/lib/wallet/mera";
import { readAccount, type PerplAccount } from "./onchain";

/** The rider's Perpl margin account, polled from the Exchange contract. */
export function usePerplAccount(address: `0x${string}` | null) {
  const [account, setAccount] = useState<PerplAccount | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setAccount(await readAccount(publicClient, address));
    setLoaded(true);
  }, [address]);

  useEffect(() => {
    setAccount(null);
    setLoaded(false);
    if (!address) return;
    refresh().catch(() => setLoaded(true));
    const t = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [address, refresh]);

  return { account, loaded, refresh };
}
