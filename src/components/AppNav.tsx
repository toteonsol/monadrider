"use client";

/**
 * AppNav · five plain-word destinations, one job each (Monad edition:
 * Play, Trade on Perpl, Spot on Kuru, Money, You).
 *
 *   PLAY   · the games (free practice, the daily set)
 *   TRADE  · the cockpit, plus the hedged desk and All Roads underneath it
 *   MONEY  · the logbook: every run, every receipt · standings + airdrops under it
 *   LEARN  · research, evidence, how it works
 *   YOU    · profile, referrals, and your roads & wallets
 *
 * WHY PLAIN WORDS. The old rail listed twelve things in racing vocabulary
 * (Paddock, Cockpit, Garage, Standings, Logbook, Desk, All Roads, Airdrops,
 * Evidence, Research…) and the home page needed a "where to find everything"
 * section to explain it. A newbie should never have to learn a language to
 * find their money. Racing stays as flavour inside copy and the games; it is
 * never the map.
 *
 *  · <1024px: a slim brand row + a fixed BOTTOM TAB BAR with the five words.
 *  · ≥1024px: a fixed LEFT RAIL; secondaries sit indented under their parent.
 *
 * The in-ride HUD is untouched; nav hides while driving.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Logomark from "./brand/Logomark";
import Icon from "./brand/Icon";
import { career } from "@/lib/game/rideLog";
import AnimatedNumber from "./AnimatedNumber";
import LanguagePicker from "./LanguagePicker";
import { useT } from "@/lib/i18n";

export type AppTab = "home" | "trade" | "spot" | "money" | "you";
type MoneyLens = "wallet" | "history";
type YouLens = "profile" | "standings";

export default function AppNav({
  tab,
  showHelp = true,
  moneyLens,
  youLens,
  onHome,
  onTrade,
  onGarage,
  onMoney,
  onYou,
  onSpot,
}: {
  tab: AppTab;
  /** the guide + support links in the rail's footer · off when embedded */
  showHelp?: boolean;
  /** which lens of Money / You is showing · marks the secondary you are on */
  moneyLens?: MoneyLens;
  youLens?: YouLens;
  onHome: () => void;
  onTrade: () => void;
  onGarage: () => void;
  onMoney: (lens: MoneyLens) => void;
  onYou: (lens: YouLens) => void;
  onSpot: () => void;
}) {
  const reduce = useReducedMotion();
  const tr = useT();
  // POINTS, ALWAYS ON SCREEN · a running score you can see climbing.
  const [pts, setPts] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setPts(career().points);
    read();
    const t = setInterval(read, 4000);
    window.addEventListener("focus", read);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", read);
    };
  }, []);
  const item = (active = false) =>
    `display relative flex min-h-[40px] shrink-0 items-center gap-3 rounded-lg px-3.5 text-[13.5px] font-bold transition active:scale-[0.98] lg:w-full lg:justify-start lg:text-[14px] ${
      active ? "text-papaya" : "text-flat hover:bg-ink-soft hover:text-bone"
    }`;
  /* the "you are here" plate glides between destinations (one shared layout
     id) instead of blinking off one and on the next */
  const here = (on: boolean) =>
    on ? (
      <motion.span
        layoutId="rail-here"
        className="absolute inset-0 -z-10 rounded-lg border-l-[3px] border-papaya bg-papaya/10"
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
        aria-hidden
      />
    ) : null;
  // secondaries: quieter, indented, only on the rail — the phone gets the five words
  const subCls = (active = false) =>
    `hidden lg:flex lg:min-h-[30px] lg:w-full lg:items-center lg:gap-2.5 lg:rounded-md lg:pl-[46px] lg:pr-3 lg:text-[12.5px] lg:font-semibold lg:transition lg:hover:bg-ink-soft lg:hover:text-bone ${
      active ? "lg:text-papaya" : "lg:text-flat-dim"
    }`;
  const sub = subCls();
  return (
    <nav
      className="mb-4 hidden w-full max-w-[440px] items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[900px]:max-w-[860px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-[60] lg:mb-0 lg:flex lg:w-[232px] lg:max-w-none lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-visible lg:border-r lg:border-hairline lg:bg-ink lg:px-3.5 lg:py-6"
      aria-label={tr("main menu")}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden lg:block">
        <div className="checker h-[7px] w-full opacity-90" />
        <div className="h-[2px] w-full bg-papaya" />
      </div>
      <div className="flex min-h-[44px] items-center gap-2.5 px-2 lg:mb-6 lg:mt-2">
        <Logomark size={28} />
        <span className="display hidden text-[15px] font-black tracking-tight text-bone min-[420px]:inline lg:inline">
          RIDE THE NOW <span className="text-papaya">MONAD</span>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none lg:flex-col lg:items-stretch lg:justify-start lg:gap-0.5">
        {/* ⚡ QUICK LAUNCH · a ride on one road or many, or a loaded desk
            event, from wherever you are (⌘K / Ctrl+K) */}
        <button
          className="gp-btn display hidden items-center justify-between gap-2 border-2 border-papaya bg-papaya/10 px-3 py-2 text-[12px] font-black uppercase tracking-wide text-papaya hover:bg-papaya hover:text-ink lg:mb-3 lg:flex"
          onClick={() => window.dispatchEvent(new Event("rtn-quick-launch"))}
          title={tr("pick a world and ride, practice or live, in seconds")}
        >
          <span>⚡ {tr("Quick launch")}</span>
          <kbd className="font-telemetry text-[10px] font-bold opacity-70">⌘K</kbd>
        </button>
        {/* PLAY */}
        <button className={item(tab === "home")} {...(tab === "home" ? { "aria-current": "page" as const } : {})} onClick={onHome} title={tr("the games · free practice, the daily set")}>
          {here(tab === "home")}
          <Icon name="arcade" size={17} className="text-papaya" /> <span>{tr("Play")}</span>
        </button>

        {/* TRADE · the cockpit, with the two advanced ways to trade under it */}
        <button className={item(tab === "trade")} {...(tab === "trade" ? { "aria-current": "page" as const } : {})} onClick={onTrade} title={tr("the Perpl cockpit · market, size, rails, go live")}>
          {here(tab === "trade")}
          <Icon name="flag" size={17} className="text-papaya" /> <span>{tr("Trade")}</span>
        </button>
        <button className={item(tab === "spot")} {...(tab === "spot" ? { "aria-current": "page" as const } : {})} onClick={onSpot} title={tr("buy or sell MON with AUSD on Kuru's order book")}>
          {here(tab === "spot")}
          <Icon name="scale" size={17} className="text-papaya" /> <span>{tr("Spot")}</span>
        </button>

        {/* MONEY · what you hold, what you have, what it cost, what it pays */}
        <button className={item(tab === "money")} {...(tab === "money" ? { "aria-current": "page" as const } : {})} onClick={() => onMoney("wallet")} title={tr("your passkey wallet, AUSD, Perpl margin and every receipt")}>
          {here(tab === "money")}
          <Icon name="wallet" size={17} className="text-papaya" /> <span>{tr("Money")}</span>
        </button>
        {tab === "money" && (
          <>
        <button className={subCls(moneyLens === "wallet")} onClick={() => onMoney("wallet")} title={tr("passkey wallet, AUSD and Perpl margin")}>
          <Icon name="wallet" size={13} /> <span>{tr("Wallet")}</span>
        </button>
        <button className={subCls(moneyLens === "history")} onClick={() => onMoney("history")} title={tr("every run, every receipt, every Monad tx")}>
          <Icon name="flag" size={13} /> <span>{tr("History")}</span>
        </button>
          </>
        )}

        {/* LEARN */}
        <a className={item()} href="/about" title={tr("how it works · why Monad · for partners")}>
          <Icon name="lab" size={17} className="text-papaya" /> <span>{tr("Learn")}</span>
        </a>
        {/* every public page (The Wire, Studies, Discoveries, Evidence,
            Predictions, How it works, For venues, Reports, Status, Points
            programs, and Credits in its footer) has a door on the /learn hub
            with its live numbers · twenty rail items did not fit a laptop
            screen, and a map that long is not a map */}

        {/* YOU · profile first, then the board and the roads behind it */}
        <button className={item(tab === "you")} {...(tab === "you" ? { "aria-current": "page" as const } : {})} onClick={() => onYou("profile")} title={tr("your stats, referrals, what you earned")}>
          {here(tab === "you")}
          <Icon name="trophy" size={17} className="text-papaya" /> <span>{tr("You")}</span>
        </button>
        {tab === "you" && (
          <>
            <button className={subCls(youLens === "profile")} {...(tab === "you" && youLens === "profile" ? { "aria-current": "page" as const } : {})} onClick={() => onYou("profile")} title={tr("your stats, referrals, what you earned")}>
              <Icon name="trophy" size={13} /> <span>{tr("Profile")}</span>
            </button>
            <button className={subCls(youLens === "standings")} {...(tab === "you" && youLens === "standings" ? { "aria-current": "page" as const } : {})} onClick={() => onYou("standings")} title={tr("the standings · points, volume, rides")}>
              <Icon name="globe" size={13} /> <span>{tr("Standings")}</span>
            </button>
          </>
        )}
      </div>
      {/* the running score · a tap goes to the standings */}
      {pts !== null && (
        <button
          onClick={() => onYou("standings")}
          className="gp-btn hidden lg:mt-auto lg:mb-3 lg:flex lg:w-full lg:items-center lg:justify-between lg:border-2 lg:border-steel lg:bg-ink-soft lg:px-3 lg:py-2.5"
          title={tr("your points · tap for the standings")}
        >
          <span className="display text-[9.5px] font-bold uppercase tracking-[0.14em] text-flat">{tr("points")}</span>
          <AnimatedNumber value={pts} format={(v) => Math.round(v).toLocaleString()} className="display text-[15px] font-black text-amber" />
        </button>
      )}
      <div className="hidden lg:block lg:px-2 lg:text-[12px] lg:leading-snug lg:text-flat-dim">
        <span className="font-bold text-flat">{tr("The honest terminal.")}</span> {tr("Tiny capped trades · auto-closed · you can't blow up.")} Perpl + Kuru on Monad.
      </div>
      {showHelp && (
        <div className="hidden lg:mt-3 lg:flex lg:gap-1.5 lg:px-1">
          <a
            href="/about"
            className="display flex min-h-[32px] flex-1 items-center justify-center gap-1.5 border border-steel text-[11px] font-bold uppercase tracking-wide text-flat transition hover:border-sky hover:text-sky"
          >
            <Icon name="lab" size={13} /> {tr("Guide")}
          </a>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="display flex min-h-[32px] flex-1 items-center justify-center gap-1.5 border border-steel text-[11px] font-bold uppercase tracking-wide text-flat transition hover:border-chart hover:text-chart"
            title={tr("the source code · AGPL-3.0")}
          >
            <Icon name="spark" size={13} /> {tr("Code")}
          </a>
        </div>
      )}
      {/* the language, on its own line · "Поддержка" and "Гайд" leave no room beside them */}
      <div className="hidden lg:mt-1.5 lg:flex lg:px-1 [&>label]:w-full">
        <LanguagePicker />
      </div>
    </nav>
  );
}

/** Mobile bottom tab bar · the five words, the phone's primary navigation (<1024px). */
export function MobileTabs({
  tab,
  onHome,
  onTrade,
  onMoney,
  onYou,
  onSpot,
}: {
  tab: AppTab;
  onHome: () => void;
  onTrade: () => void;
  onMoney: () => void;
  onYou: () => void;
  onSpot: () => void;
}) {
  const reduce = useReducedMotion();
  const tr = useT();
  const t = (active: boolean) =>
    // labels scale on the narrowest phones · "APRENDER", "ОБУЧЕНИЕ" must fit a 320px screen's fifth
    `display relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[clamp(9px,2.8vw,10.5px)] font-bold uppercase tracking-[0.04em] transition active:scale-[0.96] min-[400px]:tracking-[0.08em] ${
      active ? "text-papaya" : "text-flat"
    }`;
  const bar = (on: boolean) =>
    on ? (
      <motion.span
        layoutId="tab-here"
        className="absolute inset-x-4 top-0 h-[3px] bg-papaya"
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
        aria-hidden
      />
    ) : null;
  return (
    <nav aria-label={tr("main menu")} className="fixed inset-x-0 bottom-0 z-[65] flex border-t border-hairline bg-ink/95 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
      <button className={t(tab === "home")} {...(tab === "home" ? { "aria-current": "page" as const } : {})} onClick={onHome}>
        {bar(tab === "home")}
        <Icon name="arcade" size={19} className={tab === "home" ? "text-papaya" : "text-flat"} />
        {tr("Play")}
      </button>
      <button className={t(tab === "trade")} {...(tab === "trade" ? { "aria-current": "page" as const } : {})} onClick={onTrade}>
        {bar(tab === "trade")}
        <Icon name="flag" size={19} className={tab === "trade" ? "text-papaya" : "text-flat"} />
        {tr("Trade")}
      </button>
      {/* ⚡ the fast lane, in thumb reach on every tab */}
      <button
        className="display relative -mt-4 flex min-w-0 flex-1 flex-col items-center gap-1 text-[clamp(9px,2.8vw,10.5px)] font-black uppercase tracking-[0.04em] text-papaya active:scale-[0.96]"
        onClick={() => window.dispatchEvent(new Event("rtn-quick-launch"))}
        aria-label={tr("Quick launch")}
      >
        <span className="grid h-11 w-11 place-items-center border-2 border-papaya bg-ink text-[20px] shadow-[0_0_18px_rgba(138,116,255,.45)]" aria-hidden>⚡</span>
        {tr("Launch")}
      </button>
      <button className={t(tab === "money")} {...(tab === "money" ? { "aria-current": "page" as const } : {})} onClick={onMoney}>
        {bar(tab === "money")}
        <Icon name="wallet" size={19} className={tab === "money" ? "text-papaya" : "text-flat"} />
        {tr("Money")}
      </button>
      <button className={t(tab === "spot")} {...(tab === "spot" ? { "aria-current": "page" as const } : {})} onClick={onSpot}>
        {bar(tab === "spot")}
        <Icon name="scale" size={19} className={tab === "spot" ? "text-papaya" : "text-flat"} />
        {tr("Spot")}
      </button>
      <button className={t(tab === "you")} {...(tab === "you" ? { "aria-current": "page" as const } : {})} onClick={onYou}>
        {bar(tab === "you")}
        <Icon name="trophy" size={19} className={tab === "you" ? "text-papaya" : "text-flat"} />
        {tr("You")}
      </button>
    </nav>
  );
}
