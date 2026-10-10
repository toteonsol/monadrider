export const usd = (n: number, dp = 2) => {
  if (Math.abs(n) < 0.5 * 10 ** -dp) n = 0;
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};

export const signedUsd = (n: number, dp = 2) => (n >= 0.5 * 10 ** -dp ? "+" : "") + usd(n, dp);

/** Price with enough digits for both BTC and sub-cent MON. */
export const price = (p: number) => {
  if (!p) return "—";
  const dp = p >= 1000 ? 1 : p >= 1 ? 3 : p >= 0.01 ? 5 : 7;
  return p.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export const qty = (n: number, dp = 4) => n.toLocaleString("en-US", { maximumFractionDigits: dp });

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
