"use client";
/**
 * App shell · one screen per job, tabs in the thumb zone on a phone and a rail
 * on a wide screen.
 */
import { useEffect, useState } from "react";
import { useMera } from "@/lib/wallet/mera";
import { RideScreen } from "./RideScreen";
import { MoneyScreen } from "./MoneyScreen";
import { SpotScreen } from "./SpotScreen";
import { usd, short } from "@/lib/fmt";

type Tab = "surf" | "passenger" | "spot" | "money";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "surf", label: "Surf", icon: "M3 17c3 0 4-8 9-8s5 6 9 4M3 21h18" },
  { id: "passenger", label: "Passenger", icon: "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" },
  { id: "spot", label: "Spot", icon: "M7 7h10l-3-3M17 17H7l3 3" },
  { id: "money", label: "Money", icon: "M3 7h18v12H3zM3 11h18M16 15h2" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("surf");
  const [asset, setAsset] = useState("MON");
  const mera = useMera();

  useEffect(() => {
    try {
      const t = localStorage.getItem("rtn-monad-tab") as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {}
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("rtn-monad-tab", t);
    } catch {}
  };

  return (
    <div className="flex h-[100dvh] flex-col lg:flex-row">
      {/* desktop rail */}
      <nav className="hidden w-56 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-6 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${tab === t.id ? "bg-ink-3 text-white" : "text-mute hover:text-lavender"}`}
            >
              <Icon d={t.icon} active={tab === t.id} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-auto">
          <WalletChip onClick={() => go("money")} />
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* mobile header */}
        <header className="flex items-center justify-between px-4 pb-1 pt-[calc(10px+var(--safe-top))] lg:hidden">
          <Brand />
          <WalletChip onClick={() => go("money")} />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto lg:px-4 lg:py-4">
          {(tab === "surf" || tab === "passenger") && (
            <RideScreen
              key={tab}
              autopilot={tab === "passenger"}
              asset={asset}
              setAsset={setAsset}
              goMoney={() => go("money")}
              goSpot={() => go("spot")}
            />
          )}
          {tab === "spot" && <SpotScreen />}
          {tab === "money" && <MoneyScreen goSpot={() => go("spot")} />}
        </main>

        {/* mobile tab bar */}
        <nav className="grid grid-cols-4 border-t border-line bg-ink-2/95 pb-[var(--safe-bottom)] backdrop-blur lg:hidden">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${tab === t.id ? "text-white" : "text-mute"}`}>
              <Icon d={t.icon} active={tab === t.id} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );

  function WalletChip({ onClick }: { onClick: () => void }) {
    return (
      <button onClick={onClick} className="flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs">
        <span className={`h-2 w-2 rounded-full ${mera.address ? "bg-cyan" : "bg-mute"}`} />
        {mera.address ? (
          <span className="num">
            {mera.balances ? usd(mera.balances.ausd) : "…"} <span className="text-mute">AUSD · {short(mera.address)}</span>
          </span>
        ) : (
          <span>Log in · passkey</span>
        )}
      </button>
    );
  }
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 512 512" aria-hidden>
        <rect width="512" height="512" rx="120" fill="#6e54ff" />
        <path d="M70 330 C 150 330, 170 190, 256 190 S 370 330, 442 270" stroke="#0e091c" strokeWidth="40" fill="none" strokeLinecap="round" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[15px] font-bold">Ride the Now</div>
        <div className="label !text-[9px] !text-monad">Monad edition</div>
      </div>
    </div>
  );
}

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#85e6ff" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
