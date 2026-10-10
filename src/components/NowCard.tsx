"use client";
/**
 * NOW · the one next move, Monad edition. Computed from what this rider has
 * actually done, so a newcomer never explores to find the next step:
 *
 *   free lap → passkey wallet → AUSD in → Perpl margin → first live ride → Passenger
 *
 * Each step is one button. The ladder underneath shows how far along they are.
 */
import { useEffect, useState } from "react";
import { listRides } from "@/lib/game/rideLog";
import { useMera } from "@/lib/wallet/mera";
import { usePerplAccount } from "@/lib/perpl/usePerplAccount";

interface Step {
  key: string;
  label: string;
  title: string;
  body: string;
  cta: string;
  go: () => void;
}

export function NowCard({
  onPlay,
  onWallet,
  onSpot,
  onTrade,
  onPassenger,
}: {
  onPlay: () => void;
  onWallet: () => void;
  onSpot: () => void;
  onTrade: () => void;
  onPassenger: () => void;
}) {
  const mera = useMera();
  const perpl = usePerplAccount(mera.address);
  const [rides, setRides] = useState({ any: 0, live: 0 });
  useEffect(() => {
    const read = () => {
      const all = listRides();
      setRides({ any: all.length, live: all.filter((r) => r.live).length });
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  const ausd = mera.balances?.ausd ?? 0;
  const steps: Step[] = [
    {
      key: "lap",
      label: "free lap",
      title: "Take a free lap.",
      body: "No wallet, no risk, about two minutes. You steer, the game shows you what a real Perpl trade would have done.",
      cta: "▶ start a free lap",
      go: onPlay,
    },
    {
      key: "passkey",
      label: "passkey",
      title: "Make your wallet with a passkey.",
      body: "Face ID or fingerprint. No seed phrase, no extension: the passkey derives a Monad wallet only you can open.",
      cta: "create passkey wallet",
      go: onWallet,
    },
    {
      key: "ausd",
      label: "AUSD",
      title: "Put a few dollars of AUSD in.",
      body: "Perpl margins everything in AUSD, Agora's dollar. Send some to your address, or swap MON for it on Kuru right here.",
      cta: "get AUSD",
      go: ausd > 0 ? onWallet : onSpot,
    },
    {
      key: "margin",
      label: "margin",
      title: "Move AUSD into Perpl.",
      body: "One tap opens your Perpl account on Monad with at least 10 AUSD. Withdraw any time.",
      cta: "open Perpl margin",
      go: onWallet,
    },
    {
      key: "live",
      label: "go live",
      title: "Ride it for real.",
      body: "Arm the engine and pick a world. Every lane you hold is a tiny, capped, auto-closed Perpl order, one Monad tx each.",
      cta: "go live →",
      go: onTrade,
    },
    {
      key: "passenger",
      label: "passenger",
      title: "Let Passenger drive.",
      body: "The autopilot rides Perpl's live order flow inside the same rails, and hands you a P&L and risk receipt.",
      cta: "try passenger",
      go: onPassenger,
    },
  ];
  const done = [
    rides.any > 0,
    !!mera.address || mera.hasPasskey,
    ausd > 0 || (perpl.account?.free ?? 0) > 0,
    !!perpl.account,
    rides.live > 0,
    false,
  ];
  const at = Math.max(0, done.findIndex((d) => !d));
  const s = steps[at];

  return (
    <div className="gp-e2 relative mx-auto mt-4 w-full max-w-[560px] border-2 border-papaya bg-ink-soft text-left">
      <div className="h-[2px] w-full bg-papaya" aria-hidden />
      <div className="p-4">
        <div className="display text-[11px] font-bold uppercase tracking-[0.16em] text-papaya">Your next move</div>
        <div className="display mt-1 text-[22px] font-black leading-tight text-bone">{s.title}</div>
        <p className="mt-1.5 text-[13px] leading-snug text-flat">{s.body}</p>
        <button onClick={s.go} className="gp-btn gp-btn-primary display mt-3 w-full border-2 border-papaya bg-papaya px-4 py-3 text-[13px] font-black uppercase tracking-wide text-ink min-[480px]:w-auto">
          {s.cta}
        </button>
        <ol className="mt-4 flex items-center gap-1" aria-label="your progress">
          {steps.map((x, i) => (
            <li key={x.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className={`h-[5px] w-full ${done[i] ? "bg-chart" : i === at ? "bg-papaya" : "bg-steel/60"}`} />
              <span className={`truncate text-[9px] font-bold uppercase tracking-[0.08em] ${i === at ? "text-papaya" : done[i] ? "text-chart" : "text-flat-dim"}`}>
                {x.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
