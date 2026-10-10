"use client";
import { useEffect, useState } from "react";

/** First-ride coach: three lines over the wave, gone after the first carve or 8s. Shown once. */
export function CoachOverlay() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("rtn-monad-coached")) return;
      localStorage.setItem("rtn-monad-coached", "1");
    } catch {}
    setShow(true);
    const t = setTimeout(() => setShow(false), 8000);
    const off = () => setShow(false);
    window.addEventListener("pointerdown", off, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", off);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
      <div className="card w-full max-w-xs space-y-2 bg-ink/90 px-4 py-3 text-sm backdrop-blur">
        <Row arrow="↑" color="text-cyan" text="Swipe up to ride the crest. You're long: you win if price rises." />
        <Row arrow="—" color="text-lavender" text="Sit on the line to be flat, out of the market." />
        <Row arrow="↓" color="text-pink" text="Swipe down into the trough. You're short: you win if it falls." />
        <p className="pt-1 text-[11px] text-mute">Stops and a max loss are on. Every exit closes the trade.</p>
      </div>
    </div>
  );
}

function Row({ arrow, color, text }: { arrow: string; color: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className={`num w-4 text-center font-bold ${color}`}>{arrow}</span>
      <span>{text}</span>
    </div>
  );
}
