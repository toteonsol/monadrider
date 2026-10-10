/**
 * Monad chain facts the app needs in one place: chain, explorer links, and the
 * contracts it talks to. Addresses come from Perpl's public context (AUSD is
 * Perpl's collateral token) and are re-checked live at runtime.
 */
import { defineChain } from "viem";

const testnet = process.env.NEXT_PUBLIC_PERPL_TESTNET === "true";

export const monad = defineChain({
  id: testnet ? 10143 : 143,
  name: testnet ? "Monad Testnet" : "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_MONAD_RPC ||
          (testnet ? "https://testnet-rpc.monad.xyz" : "https://rpc.monad.xyz"),
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadScan",
      url: testnet ? "https://testnet.monadscan.com" : "https://monadscan.com",
    },
  },
});

/** Agora's AUSD on Monad mainnet · 6 decimals · Perpl's margin token. */
export const AUSD = {
  address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const,
  decimals: 6,
  symbol: "AUSD",
};

/** Perpl's Exchange contract on Monad mainnet (from /v1/pub/context). */
export const PERPL_EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F" as const;

const hex = (h: string) => (h.startsWith("0x") ? h : `0x${h}`);

export const txUrl = (hash: string) => `${monad.blockExplorers.default.url}/tx/${hex(hash)}`;
export const addressUrl = (a: string) => `${monad.blockExplorers.default.url}/address/${a}`;
export const shortHash = (h: string) => {
  const x = hex(h);
  return `${x.slice(0, 6)}…${x.slice(-4)}`;
};
