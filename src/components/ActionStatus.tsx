"use client";
/**
 * One answer to "did it work?" for every money action: a live step while it
 * runs, then a ✓ result with its Monad txs, or a plain error with what to do.
 */
import { TxLink } from "./TxLink";

export type ActionState =
  | { phase: "idle" }
  | { phase: "busy"; step: string }
  | { phase: "done"; title: string; lines?: string[]; txs: { label: string; hash: string }[] }
  | { phase: "error"; message: string; hint?: string };

export function ActionStatus({ s, onClear }: { s: ActionState; onClear?: () => void }) {
  if (s.phase === "idle") return null;
  if (s.phase === "busy")
    return (
      <div className="mt-3 flex items-center gap-2.5 border-2 border-papaya/60 bg-papaya/10 px-3 py-2.5 text-[13px] text-bone" role="status" aria-live="polite">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-papaya border-t-transparent" aria-hidden />
        {s.step}
        <span className="ml-auto text-[11px] text-flat">confirming on Monad</span>
      </div>
    );
  if (s.phase === "error")
    return (
      <div className="mt-3 border-2 border-blood/70 bg-blood/10 px-3 py-2.5 text-[13px]" role="alert">
        <div className="flex items-start justify-between gap-2">
          <span className="font-bold text-blood">✕ {s.message}</span>
          {onClear && (
            <button onClick={onClear} className="text-[11px] text-flat hover:text-bone" aria-label="dismiss">
              ✕
            </button>
          )}
        </div>
        {s.hint && <p className="mt-1 text-[12px] text-flat">{s.hint}</p>}
      </div>
    );
  return (
    <div className="mt-3 border-2 border-chart/70 bg-chart/10 px-3 py-2.5 text-[13px]" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-chart">✓ {s.title}</span>
        {onClear && (
          <button onClick={onClear} className="text-[11px] text-flat hover:text-bone" aria-label="dismiss">
            ✕
          </button>
        )}
      </div>
      {s.lines?.map((l) => (
        <p key={l} className="mt-0.5 text-[12px] text-bone">
          {l}
        </p>
      ))}
      <div className="mt-1.5 space-y-0.5">
        {s.txs.map((t) => (
          <div key={t.hash} className="flex justify-between gap-2 text-[12px]">
            <span className="text-flat">{t.label}</span>
            <TxLink hash={t.hash} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Turn a wallet / RPC error into one line plus what to do about it. */
export function explainError(e: unknown): { message: string; hint?: string } {
  const raw = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
  const m = raw.split("\n")[0];
  if (/missing or invalid parameters|-32602|rate limit|429|fetch failed|failed to fetch|network|HTTP request failed/i.test(m))
    return { message: "Monad's RPC didn't answer cleanly.", hint: "That's a network hiccup, not your wallet. Check the balance above (it refreshes), then tap again if nothing moved." };
  if (/insufficient funds|gas/i.test(m)) return { message: "Not enough MON to pay gas.", hint: "Send a little MON to this wallet (0.1 is plenty), then try again." };
  if (/exceeds balance|transfer amount/i.test(m)) return { message: "Not enough of that token in the wallet.", hint: "Lower the amount, or tap Max." };
  if (/SESSION_ENDED|session/i.test(m)) return { message: "The wallet is locked.", hint: "Log in with your passkey again in Money." };
  if (/reverted/i.test(m)) return { message: "The transaction was refused onchain.", hint: m };
  if (/timeout|timed out/i.test(m)) return { message: "Monad didn't confirm in time.", hint: "It may still land: check your balance in a moment before retrying." };
  return { message: m };
}
