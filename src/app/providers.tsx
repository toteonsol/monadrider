"use client";
import { useEffect } from "react";
import { MeraProvider } from "@/lib/wallet/mera";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return <MeraProvider>{children}</MeraProvider>;
}
