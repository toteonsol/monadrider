"use client";

/**
 * 📺 BROADCAST LAYER · the shared voice of every cartridge.
 *
 * ThreeRide grew the first lower-third; Surfer and Pulse deserve the same
 * treatment without three copies of a queue drifting apart. One hook owns the
 * pacing law (big cards, held long enough to read, nothing tramples, never a
 * backlog), one component renders the card, one renders the on-air toggle,
 * and an aria-live mirror speaks every line — screen readers cast the ride
 * today, an OBS browser source scrapes the same text tomorrow.
 */
import { useEffect, useRef, useState } from "react";

export function useBroadcast(defaultOn = true) {
  const [broadcast, setBroadcast] = useState(defaultOn);
  const [cast, setCast] = useState<string | null>(null);
  const q = useRef<string[]>([]);
  const busy = useRef(false);
  const lastAt = useRef(0);
  const pump = () => {
    if (busy.current) return;
    const next = q.current.shift();
    if (!next) return;
    busy.current = true;
    lastAt.current = Date.now();
    setCast(next);
    setTimeout(() => {
      setCast(null);
      setTimeout(() => {
        busy.current = false;
        pump();
      }, 350);
    }, 3200);
  };
  const pushCast = (m: string) => {
    q.current = [...q.current.slice(-2), m]; // stay fresh · never backlog
    pump();
  };
  // 🔭 the research fleet casts into every cartridge through one event
  useEffect(() => {
    const onFleet = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) pushCast(text);
    };
    window.addEventListener("rtn-fleet-cast", onFleet);
    return () => window.removeEventListener("rtn-fleet-cast", onFleet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { broadcast, setBroadcast, cast, pushCast, lastAt };
}

/** The big lower-third card · readable on a 480p stream. */
export function CastLowerThird({ cast }: { cast: string | null }) {
  if (!cast) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-20 flex justify-center px-4">
      <div className="animate-[rtn-pop_0.4s_ease-out] max-w-[92vw] border-l-4 border-papaya bg-ink/85 px-5 py-3 backdrop-blur-md min-[640px]:max-w-[720px]">
        <div className="display text-[9px] font-black uppercase tracking-[0.3em] text-papaya">
          hyperider · live tape
        </div>
        <div className="mt-0.5 text-[15px] font-bold leading-snug text-bone min-[640px]:text-[20px]">
          {cast}
        </div>
      </div>
    </div>
  );
}

/** The on-air switch · same look in every cartridge. */
export function CastToggle({
  broadcast,
  onToggle,
}: {
  broadcast: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`pointer-events-auto absolute right-3 top-[30%] z-20 border px-2 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${
        broadcast ? "border-papaya/70 text-papaya" : "border-steel text-flat"
      }`}
      title="broadcast mode · big narration for streaming"
    >
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${broadcast ? "bg-blood" : "bg-flat"}`} aria-hidden />{broadcast ? "on air" : "cast off"}
    </button>
  );
}

/** Spoken mirror · leading emoji stripped so the words lead. */
export function CastCaptions({ cast }: { cast: string | null }) {
  return (
    <div aria-live="polite" className="sr-only">
      {cast?.replace(/^[^\p{L}\p{N}]+/u, "")}
    </div>
  );
}
