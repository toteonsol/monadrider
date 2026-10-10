"use client";

/**
 * GamePicker · THE STARTING GRID, as a decision instead of a default.
 *
 * The gap this closes: "there is no way to select a game, it just automatically
 * is the car drive." THE GRID existed on the paddock, but the primary CTA went
 * straight into RIDE, so three of the four worlds were decoration you had to
 * scroll past rather than choices in the flow. Every route into playing now
 * comes through here, and each cartridge shows its own real 3D frame, so the
 * choice is made looking at the thing itself.
 */
import { motion } from "framer-motion";
import { useDialog, dialogProps } from "@/lib/useDialog";

export type GameKey = "ride" | "surfer" | "pulse" | "depot" | "city";

const GAMES: {
  key: GameKey;
  no: string;
  title: string;
  line: string;
  best: string;
  shot: string;
}[] = [
  {
    key: "ride",
    no: "01",
    title: "Ride",
    line: "The 3D night drive. Lanes are longs and shorts; hold one and the position is real.",
    best: "best for: learning what a position feels like",
    shot: "/game/ride3d.jpg",
  },
  {
    key: "surfer",
    no: "02",
    title: "Surfer",
    line: "Carve the live price swell. The lip is long, the trough is short, the wave is the tape.",
    best: "best for: reading momentum",
    shot: "/game/surf3d.jpg",
  },
  {
    key: "pulse",
    no: "03",
    title: "Pulse",
    line: "The rhythm tunnel. The tempo IS the market's, so the beat you ride is real flow.",
    best: "best for: long hands-on sessions",
    shot: "/game/pulse3d.jpg",
  },
  {
    key: "depot",
    no: "04",
    title: "Depot",
    line: "Your yard, alive. Every crate is volume you actually farmed, stacking as you go.",
    best: "best for: watching progress build",
    shot: "/game/depot3d.jpg",
  },
  {
    key: "city",
    no: "05",
    title: "Now City · preview",
    line: "Drive somewhere. Every job has an address, every district is a venue, and every car on the road is a real fill.",
    best: "preview: render-only, no trades in this world yet",
    shot: "/game/city3d.jpg",
  },
];

export default function GamePicker({
  armed,
  onPick,
  onClose,
  onGoLive,
}: {
  armed: boolean;
  onPick: (g: GameKey) => void;
  onClose: () => void;
  onGoLive: () => void;
}) {
  const dlg = useDialog<HTMLDivElement>(true, onClose);
  return (
    <motion.div ref={dlg} {...dialogProps("pick a game")} className="fixed inset-0 z-[82] flex items-center justify-center bg-ink/92 p-4 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="max-h-[90vh] w-full max-w-[1040px] overflow-y-auto border-2 border-steel bg-ink-soft"
      >
        <div className="checker h-[8px] w-full opacity-90" />
        <div className="h-[2px] w-full bg-papaya" />
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 min-[900px]:px-7">
          <div>
            <h2 className="display text-[22px] font-black uppercase leading-none text-bone min-[900px]:text-[30px]">
              Pick your ride
            </h2>
            <p className="mt-2 max-w-[620px] text-[12.5px] leading-snug text-flat">
              Four worlds, one engine. They all farm the same way and share your points, so this is
              a taste question, not a strategy one. The fifth is the open-world preview — a look at where the drive is going.{" "}
              <b className="text-bone">
                {armed ? "You are live, so this lap trades for real." : "Practice is free and needs no wallet."}
              </b>
            </p>
          </div>
          <button
            onClick={onClose}
            className="gp-btn display border-2 border-steel px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-flat hover:border-papaya hover:text-papaya"
          >
            ✕ close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 border-y-2 border-steel min-[720px]:grid-cols-2 min-[1000px]:grid-cols-5">
          {GAMES.map((g, i) => (
            <button
              key={g.key}
              onClick={() => onPick(g.key)}
              className={`group relative min-h-[210px] overflow-hidden text-left transition ${
                i < GAMES.length - 1 ? "border-b-2 border-dashed border-hairline min-[1000px]:border-b-0 min-[1000px]:border-r-2" : ""
              } ${i === 1 ? "min-[720px]:border-b-2 min-[1000px]:border-b-0" : ""}`}
            >
              <span
                aria-hidden
                className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.07]"
                style={{ backgroundImage: `url(${g.shot})` }}
              />
              <span
                aria-hidden
                className="absolute inset-0 transition group-hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(17,16,19,.45), rgba(17,16,19,.1) 38%, rgba(17,16,19,.94))",
                }}
              />
              <span aria-hidden className="gp-scan" style={{ animationDelay: `${i * 0.7}s` }} />
              <span aria-hidden className="display absolute left-4 top-3 text-[28px] font-black leading-none text-bone/40">
                {g.no}
              </span>
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-4">
                <span className="display text-[17px] font-bold uppercase tracking-wide text-bone">
                  {g.title}
                </span>
                <span className="text-[11.5px] leading-snug text-bone/75">{g.line}</span>
                <span className="display mt-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-papaya">
                  {g.best}
                </span>
                <span className="display mt-2 w-fit bg-papaya px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-ink opacity-0 transition group-hover:opacity-100">
                  ▶ drive this
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* the door to real farming, present at the moment of choosing */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 min-[900px]:px-7">
          <div className="min-w-[240px] flex-1 text-[12px] leading-snug text-flat">
            {armed ? (
              <>
                <b className="text-chart">● Live.</b> Whichever world you pick, your driving places
                real capped trades and farms this road&apos;s points.
              </>
            ) : (
              <>
                Not live yet, so this is free practice. Going live takes about two minutes and turns the
                same driving into real farmed volume.
              </>
            )}
          </div>
          {!armed && (
            <button
              onClick={onGoLive}
              className="gp-btn gp-btn-primary display bg-papaya px-5 py-2.5 text-[11px] font-black uppercase tracking-wide text-ink"
            >
              Set up a real ride →
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
