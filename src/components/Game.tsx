"use client";
/**
 * Ride the Now · Monad edition · the app.
 *
 * The Paddock hub (hero, next move, pit board, the grid, the daily set, the
 * live Paddock, the sellers) around three worlds (RIDE, SURFER, PULSE), a
 * Perpl cockpit, Kuru spot, and Money. One live bridge carries every world's
 * lane changes to Perpl on Monad.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AppNav, { MobileTabs, type AppTab } from "./AppNav";
import Logomark from "./brand/Logomark";
import Icon from "./brand/Icon";
import HeroCar from "./HeroCar";
import GamePicker, { type GameKey } from "./GamePicker";
import { Cartridges, DailySet } from "./ArcadeCards";
import PaddockNow from "./PaddockNow";
import PointsBoard from "./PointsBoard";
import RiderHubPanel from "./RiderHub";
import { NowCard } from "./NowCard";
import { TradeCockpit } from "./TradeCockpit";
import { MoneyScreen } from "./MoneyScreen";
import { SpotScreen } from "./SpotScreen";
import { Logbook } from "./Logbook";
import { ReceiptSheet } from "./ReceiptSheet";
import { withdrawAusd } from "@/lib/perpl/onchain";
import { publicClient } from "@/lib/wallet/mera";
import { RadioBell, RadioToasts } from "./PitRadio";
import { LiveChip } from "./LiveChip";
import { PitWall } from "./PitWall";
import { Roadmap } from "./Roadmap";
import { useOpportunities } from "@/lib/useOpportunities";
import { radio } from "@/lib/radio";
import { useLiveBridge } from "@/lib/ride/useLiveBridge";
import { career, type Career } from "@/lib/game/rideLog";
import { fetchStreak } from "@/lib/game/backend";
import { inviteLink, myCode } from "@/lib/game/referral";
import { clubProgress, fmtClub } from "@/lib/game/clubs";
import { useMera } from "@/lib/wallet/mera";
import { usd } from "@/lib/fmt";

// the worlds are heavy (three.js); load each only when it opens
const ThreeRide = dynamic(() => import("./ThreeRide"), { ssr: false });
const SurfRide = dynamic(() => import("./SurfRide"), { ssr: false });
const PulseRide = dynamic(() => import("./PulseRide"), { ssr: false });

type MoneyLens = "wallet" | "history";

export function Game() {
  const [tab, setTab] = useState<AppTab>("home");
  // where the rider came from, so Spot / Money can offer the way back
  const [from, setFrom] = useState<AppTab | null>(null);
  const [moneyLens, setMoneyLens] = useState<MoneyLens>("wallet");
  const [asset, setAsset] = useState("MON");
  const [world, setWorld] = useState<GameKey | null>(null);
  const [picker, setPicker] = useState(false);
  const [intro, setIntro] = useState(false);
  const [hub, setHub] = useState(false);
  const [stats, setStats] = useState<Career | null>(null);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const bridge = useLiveBridge(asset);
  const mera = useMera();
  useOpportunities();

  useEffect(() => {
    const read = () => setStats(career());
    read();
    void fetchStreak().then(setStreak);
    try {
      setIntro(!localStorage.getItem("rtn-monad-intro"));
    } catch {}
    window.addEventListener("focus", read);
    const launch = () => setPicker(true);
    window.addEventListener("rtn-quick-launch", launch);
    return () => {
      window.removeEventListener("focus", read);
      window.removeEventListener("rtn-quick-launch", launch);
    };
  }, []);
  useEffect(() => {
    if (!world) setStats(career());
  }, [world]);

  const go = useCallback((t: AppTab) => {
    setTab((cur) => {
      if (t !== cur) setFrom(t === "spot" || t === "money" ? cur : null);
      return t;
    });
    window.scrollTo({ top: 0 });
  }, []);
  const openMoney = (lens: MoneyLens) => {
    setMoneyLens(lens);
    go("money");
  };
  const closeIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem("rtn-monad-intro", "1");
    } catch {}
  };
  // the worlds' own "go live right here" / "stop" buttons
  useEffect(() => {
    const armReq = () => {
      if (bridge.armed) return;
      if (bridge.canArm) void bridge.arm();
      else {
        setWorld(null);
        go("trade");
      }
    };
    const disarmReq = () => void bridge.disarm();
    window.addEventListener("rtn-arm-request", armReq);
    window.addEventListener("rtn-disarm-request", disarmReq);
    return () => {
      window.removeEventListener("rtn-arm-request", armReq);
      window.removeEventListener("rtn-disarm-request", disarmReq);
    };
  }, [bridge, go]);
  const exitWorld = () => {
    setWorld(null);
    if (bridge.armed) void bridge.disarm();
  };
  const driveMode = bridge.mode === "passenger" ? "passenger" : "turbo";
  // "ride this" from a radio card: switch market (not mid-ride) and open the cockpit
  const rideThis = (a: string) => {
    if (world) setWorld(null);
    if (!bridge.armed) setAsset(a);
    go("trade");
  };
  // "switch" from the pit wall: mid-ride it ends the ride first (flattening), then switches
  const switchRoad = async (a: string) => {
    if (bridge.armed) await bridge.disarm();
    setAsset(a);
    radio({ kind: "tip", tone: "info", title: `Switched to ${a}`, body: "Go live again from Trade, or keep riding practice on the new road." });
  };

  /* ── a world is open: it owns the screen ── */
  if (world) {
    const common = {
      onExit: exitWorld,
      setTargetRef: bridge.armed ? bridge.refs.setTargetRef : undefined,
      flattenRef: bridge.armed ? bridge.refs.flattenRef : undefined,
      realRef: bridge.armed ? bridge.refs.realRef : undefined,
      armed: bridge.armed,
      mode: driveMode as "turbo" | "passenger",
    };
    return (
      <div className="fixed inset-0 z-[90] bg-ink">
        {world === "ride" && (
          <ThreeRide
            {...common}
            world="perpl"
            onGoLive={() => {
              setWorld(null);
              go("trade");
            }}
          />
        )}
        {world === "surfer" && <SurfRide {...common} />}
        {world === "pulse" && <PulseRide {...common} />}
        <LiveChip bridge={bridge} asset={asset} onRide={rideThis} />
        <div className="pointer-events-none fixed right-3 top-[calc(212px+var(--safe-top))] z-[93] flex flex-col items-end">
          <PitWall bridge={bridge} asset={asset} onSwitch={(a) => void switchRoad(a)} compact />
        </div>
        <RadioToasts onRide={rideThis} ridesOnly />
      </div>
    );
  }

  const club = stats ? clubProgress(stats.realVolume) : null;

  return (
    <div className="min-h-[100dvh] lg:pl-[232px]">
      <AppNav
        tab={tab}
        moneyLens={tab === "money" ? moneyLens : undefined}
        youLens={tab === "you" ? "profile" : undefined}
        onHome={() => go("home")}
        onTrade={() => go("trade")}
        onGarage={() => openMoney("wallet")}
        onMoney={(l) => openMoney(l === "history" ? "history" : "wallet")}
        onYou={() => go("you")}
        onSpot={() => go("spot")}
      />

      {/* phone brand row */}
      <header className="flex items-center justify-between px-4 pb-2 pt-[calc(12px+var(--safe-top))] lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logomark size={26} />
          <span className="display text-[14px] font-black tracking-tight text-bone">
            RIDE THE NOW <span className="text-papaya">MONAD</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
        <RadioBell onRide={rideThis} />
        <button onClick={() => openMoney("wallet")} className="display flex items-center gap-2 border-2 border-steel px-2.5 py-1.5 text-[11px] font-bold uppercase text-bone">
          <span className={`h-2 w-2 rounded-full ${mera.address ? "bg-chart" : "bg-steel"}`} />
          {mera.address ? `${usd(mera.balances?.ausd ?? 0)} AUSD` : "log in"}
        </button>
        </div>
      </header>
      {/* desktop: the radio sits top-right of the page */}
      <div className="fixed right-5 top-4 z-50 hidden lg:block">
        <RadioBell onRide={rideThis} />
      </div>
      <RadioToasts onRide={rideThis} />

      {bridge.armed && tab !== "trade" && (
        <button onClick={() => go("trade")} className="display sticky top-0 z-40 flex w-full items-center justify-center gap-2 border-b-2 border-chart bg-ink/95 py-2 text-[11px] font-bold uppercase tracking-wide text-chart backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-chart" /> live on Perpl · {asset} · open the cockpit
        </button>
      )}

      <main className="pb-28 lg:pb-10">
        {from && from !== tab && (tab === "spot" || tab === "money") && (
          <div className="mx-auto w-full max-w-5xl px-4 pt-2">
            <button onClick={() => go(from)} className="display flex items-center gap-2 border-2 border-papaya bg-papaya/10 px-3 py-2 text-[11px] font-black uppercase text-papaya hover:bg-papaya hover:text-ink">
              ← back to {from === "home" ? "play" : from}
            </button>
          </div>
        )}
        {tab === "home" && (
          <div className="relative w-full px-4 pt-2">
            <PitLane />
            <div className="relative mx-auto w-full max-w-[440px] min-[900px]:max-w-[720px]">
              <HeroCar />
              <div className="mx-auto mb-4 flex w-fit items-center gap-2 border border-steel px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-flat min-[900px]:text-[11.5px]">
                Season 1 · Monad · Perpl + Kuru · zero custody
              </div>
              <h1 className="display text-center text-[34px] font-black uppercase leading-[1.04] tracking-tight text-bone min-[900px]:text-[58px] [text-shadow:_0_2px_12px_rgba(0,0,0,0.9)]">
                Drive the market.
                <br />
                <span className="text-papaya">Ride it on</span> <span className="gp-outline-thin min-[900px]:[-webkit-text-stroke:2px_var(--bone)]">Monad.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-[440px] text-center text-[13.5px] leading-relaxed text-flat min-[900px]:max-w-[560px] min-[900px]:text-[16px] [text-shadow:_0_1px_8px_rgba(0,0,0,0.95)]">
                A racing, surfing and rhythm game where every lane you hold is a <span className="text-bone">tiny, capped, auto-closed Perpl trade</span>,
                sent from a <span className="text-papaya">passkey wallet</span> and settled on Monad in under a second.{" "}
                <a href="/about" className="text-sky underline underline-offset-2">
                  how it works →
                </a>
              </p>

              {intro && (
                <div className="gp-e2 relative mx-auto mt-6 w-full max-w-[560px] overflow-hidden border-2 border-steel bg-ink-soft/80 text-left" role="region" aria-label="new here">
                  <div className="checker h-[6px] w-full opacity-80" aria-hidden />
                  <div className="p-4">
                    <div className="display text-[11px] font-bold uppercase tracking-[0.16em] text-papaya">New here · the whole idea in three lines</div>
                    <ol className="mt-2.5 space-y-2">
                      {(
                        [
                          ["arcade", "Play free first.", "No wallet, no risk. Steer, carve, hit the beat. The live Perpl market drives every world."],
                          ["shield", "Log in with a passkey.", "Face ID or fingerprint makes your Monad wallet. No seed phrase, no extension, nothing to lose on paper."],
                          ["spark", "Go live with a few AUSD.", "Every lane becomes a tiny, capped, auto-closed Perpl trade, each one a Monad transaction you can open."],
                        ] as const
                      ).map(([icon, b, t]) => (
                        <li key={b} className="flex gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center border border-steel bg-ink">
                            <Icon name={icon} size={16} className="text-papaya" />
                          </span>
                          <span className="text-[12.5px] leading-snug text-flat">
                            <b className="text-bone">{b}</b> {t}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          closeIntro();
                          setPicker(true);
                        }}
                        className="gp-btn gp-btn-primary display border-2 border-papaya bg-papaya px-4 py-2 text-[12px] font-black uppercase tracking-wide text-ink"
                      >
                        ▶ take a free lap
                      </button>
                      <button onClick={closeIntro} className="gp-btn display border-2 border-steel px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-flat hover:text-bone">
                        got it
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <NowCard
                onPlay={() => setPicker(true)}
                onWallet={() => openMoney("wallet")}
                onSpot={() => go("spot")}
                onTrade={() => go("trade")}
                onPassenger={() => {
                  bridge.setMode("passenger");
                  go("trade");
                }}
              />
              <div className="mx-auto mt-3 flex w-full max-w-[560px] items-center justify-center">
                <button
                  onClick={() => go("trade")}
                  className="gp-btn display flex items-center gap-2 border-2 border-steel px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-flat transition hover:border-papaya hover:text-papaya"
                >
                  {bridge.armed ? "● you're live · open the cockpit →" : "already know perps? go live in about 2 min →"}
                </button>
              </div>

              {stats && stats.rides > 0 && (
                <div className="mx-auto mb-2 mt-5 w-full max-w-[560px] border-2 border-steel bg-ink-soft">
                  <div className="flex items-center justify-between border-b-2 border-steel px-4 py-2.5">
                    <span className="display text-[11px] font-bold uppercase tracking-[0.14em] text-flat">Pit board</span>
                    <span className="h-2 w-2 rounded-full bg-chart" />
                  </div>
                  <div className="grid grid-cols-3">
                    {(
                      [
                        ["Points", stats.points.toLocaleString(), "text-amber"],
                        ["Rides", String(stats.rides), "text-bone"],
                        ["Real volume", `$${Math.round(stats.realVolume).toLocaleString()}`, "text-chart"],
                      ] as const
                    ).map(([label, value, tone], i) => (
                      <div key={label} className={`px-3 py-3.5 text-center ${i < 2 ? "border-r border-hairline" : ""}`}>
                        <div className="display text-[10.5px] font-bold uppercase tracking-[0.14em] text-flat">{label}</div>
                        <div className={`display mt-1 text-[19px] font-bold tabular-nums min-[900px]:text-[24px] ${tone}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {club && (
                    <div className="border-t border-hairline px-4 py-2.5">
                      <div className="flex items-center gap-1.5" aria-hidden>
                        <span className="display shrink-0 text-[9.5px] font-black tabular-nums text-flat">{fmtClub(club.prev)}</span>
                        <span className="relative h-[6px] flex-1 bg-steel/50">
                          <span className="absolute inset-y-0 left-0 bg-papaya" style={{ width: `${Math.max(1, club.pct * 100)}%` }} />
                        </span>
                        <span className="flag h-[10px] w-3 shrink-0" />
                        <span className="display shrink-0 text-[9.5px] font-black tabular-nums text-bone">{fmtClub(club.next)}</span>
                      </div>
                      <div className="mt-0.5 text-right text-[10.5px] tabular-nums text-flat">
                        ${Math.round(club.next - stats.realVolume).toLocaleString()} to the {fmtClub(club.next)} club
                      </div>
                    </div>
                  )}
                </div>
              )}
              {stats && stats.rides > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11.5px] tabular-nums text-flat">
                  {streak > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex items-center gap-[3px]" aria-hidden>
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber/35" />
                        {Array.from({ length: 7 }, (_, k) => (
                          <span key={k} className={`relative h-[9px] w-[9px] ${k >= 7 - Math.min(7, streak) ? "bg-amber" : "border border-steel bg-ink"}`} />
                        ))}
                      </span>
                      <b className="text-amber">{streak}d</b>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteLink());
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="display border-2 border-steel px-2.5 py-1 text-[11px] font-bold uppercase text-bone transition hover:border-papaya hover:text-papaya"
                    title={`friends who join via your link ride with a +10% points boost · your code: ${myCode()}`}
                  >
                    {copied ? "✓ copied" : "invite"}
                  </button>
                  <button onClick={() => setHub(true)} className="display border-2 border-steel px-2.5 py-1 text-[11px] font-bold uppercase text-bone transition hover:border-papaya hover:text-papaya">
                    stats
                  </button>
                </div>
              )}
            </div>

            <div className="mx-auto w-full max-w-[1100px]">
              <Cartridges
                cue={bridge.armed}
                onPlayRide={() => setWorld("ride")}
                onPlaySurf={() => setWorld("surfer")}
                onPlayPulse={() => setWorld("pulse")}
              />
              <DailySet />
              <PaddockNow onStandings={() => go("you")} onPlay={() => setPicker(true)} />
              <PointsBoard onStandings={() => go("you")} onPlay={() => setPicker(true)} />
              <Sellers onPassenger={() => {
                bridge.setMode("passenger");
                go("trade");
              }} onSpot={() => go("spot")} onYou={() => go("you")} />
              <Roadmap />
            </div>
          </div>
        )}

        {tab === "trade" && <TradeCockpit bridge={bridge} asset={asset} setAsset={setAsset} onRide={() => setPicker(true)} onMoney={() => openMoney("wallet")} />}
        {tab === "spot" && <SpotScreen />}
        {tab === "money" &&
          (moneyLens === "history" ? (
            <div className="mx-auto w-full max-w-4xl px-4 py-4">
              <Logbook owner={mera.address} />
            </div>
          ) : (
            <MoneyScreen goSpot={() => go("spot")} />
          ))}
        {tab === "you" && (
          <div className="mx-auto w-full max-w-[1100px] px-4">
            <PointsBoard onStandings={() => setHub(true)} onPlay={() => setPicker(true)} />
            <PaddockNow onStandings={() => setHub(true)} onPlay={() => setPicker(true)} />
            <div className="mt-6">
              <Logbook owner={mera.address} />
            </div>
          </div>
        )}
      </main>

      <MobileTabs tab={tab} onHome={() => go("home")} onTrade={() => go("trade")} onMoney={() => openMoney("wallet")} onYou={() => go("you")} onSpot={() => go("spot")} />

      {picker && (
        <GamePicker
          armed={bridge.armed}
          onPick={(g) => {
            setPicker(false);
            setWorld(g);
          }}
          onClose={() => setPicker(false)}
          onGoLive={() => {
            setPicker(false);
            go("trade");
          }}
        />
      )}
      {hub && <RiderHubPanel onClose={() => setHub(false)} />}
      {bridge.receipt && !bridge.armed && (
        <ReceiptSheet
          receipt={bridge.receipt}
          onClose={bridge.dismissReceipt}
          onSpot={() => go("spot")}
          onSweep={
            mera.wallet && bridge.route === "passkey"
              ? async (amount) => {
                  const r = await withdrawAusd(publicClient, mera.wallet!, amount);
                  void mera.refresh();
                  return r.hash;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** the paddock's ambience · Monad night light behind the hero */
function PitLane() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 -top-6 h-[560px] w-screen -translate-x-1/2 lg:w-[calc(100vw-232px)]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 40% at 28% 14%, rgba(110,84,255,.16), transparent 64%), radial-gradient(38% 38% at 74% 8%, rgba(255,142,228,.07), transparent 64%), radial-gradient(40% 34% at 50% 56%, rgba(133,230,255,.06), transparent 66%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cpath d='M0 60h120M60 0v120' stroke='%23ffffff' stroke-opacity='0.022' stroke-width='1'/%3E%3C/svg%3E\")",
          maskImage: "radial-gradient(120% 90% at 50% 30%, black 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 30%, black 30%, transparent 78%)",
        }}
      />
    </div>
  );
}

/** what exists here and nowhere else · every card is a door */
function Sellers({ onPassenger, onSpot, onYou }: { onPassenger: () => void; onSpot: () => void; onYou: () => void }) {
  const cards: [Parameters<typeof Icon>[0]["name"], string, string, string | (() => void)][] = [
    ["flag", "Every carve is a Monad tx", "lanes become IOC orders sent from your own wallet straight to Perpl's Exchange contract, one block each", "/about"],
    ["shield", "A passkey is the wallet", "Mera derives a Monad wallet from Face ID or a fingerprint · no seed phrase, no extension, no custodian", "/about"],
    ["spark", "Passenger", "the autopilot rides Perpl's live order flow inside your rails and hands back a P&L and risk receipt", onPassenger],
    ["trophy", "Receipts, not claims", "a live ride counts on the board only after its Monad transactions check out onchain", onYou],
    ["wallet", "Bank it on Kuru", "turn a ride into spot MON, or MON into AUSD margin, on Kuru's onchain order book", onSpot],
    ["scale", "You can't blow up", "tiny capped clips, a stop, a max loss and a timer on every ride · every exit flattens", "/about"],
  ];
  return (
    <div className="mt-9 w-full">
      <div className="display text-[19px] font-black uppercase text-bone min-[900px]:text-[22px]">Built like nothing else</div>
      <p className="mt-1 text-[12.5px] text-flat">the parts you won&apos;t find on any other perp surface, every card is a door</p>
      <div className="mt-3 grid grid-cols-1 border-2 border-steel min-[640px]:grid-cols-2 min-[980px]:grid-cols-3">
        {cards.map(([icon, title, line, dest], i) => {
          const inner = (
            <>
              <span className="grid h-9 w-9 shrink-0 place-items-center border border-steel bg-ink">
                <Icon name={icon} size={18} className="text-papaya" />
              </span>
              <span>
                <span className="display block text-[13.5px] font-bold text-bone">{title}</span>
                <span className="mt-1 block text-[11.5px] leading-snug text-flat">{line}</span>
              </span>
            </>
          );
          const cls = `flex items-start gap-3 bg-ink-soft/60 px-4 py-4 text-left transition hover:bg-ink-soft ${
            i < 5 ? "border-b-2 border-dashed border-hairline" : ""
          } min-[640px]:[&:nth-child(odd)]:border-r-2 min-[640px]:[&:nth-child(odd)]:border-dashed min-[640px]:[&:nth-child(odd)]:border-hairline min-[640px]:[&:nth-child(n+5)]:border-b-0 min-[980px]:[&:nth-child(3n)]:border-r-0 min-[980px]:[&:nth-child(n+4)]:border-b-0 min-[980px]:[&:not(:nth-child(3n))]:border-r-2 min-[980px]:[&:not(:nth-child(3n))]:border-dashed min-[980px]:[&:not(:nth-child(3n))]:border-hairline`;
          return typeof dest === "string" ? (
            <a key={title} href={dest} className={cls}>
              {inner}
            </a>
          ) : (
            <button key={title} onClick={dest} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
