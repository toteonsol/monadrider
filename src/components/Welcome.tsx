"use client";
import { useEffect, useState } from "react";

/** First-open sheet: what this is in one breath, and two ways in. */
export function Welcome({ onLogin }: { onLogin: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("rtn-monad-welcomed")) setOpen(true);
    } catch {}
  }, []);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem("rtn-monad-welcomed", "1");
    } catch {}
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="card w-full overflow-hidden rounded-b-none pb-[var(--safe-bottom)] sm:max-w-md sm:rounded-b-[20px]" role="dialog" aria-label="Welcome">
        <svg viewBox="0 0 400 120" className="block w-full" aria-hidden>
          <defs>
            <linearGradient id="wsea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6e54ff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#6e54ff" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M0 90 C 60 90, 80 40, 140 45 S 220 100, 280 60 S 360 30, 400 50 L400 120 L0 120Z" fill="url(#wsea)" />
          <path d="M0 90 C 60 90, 80 40, 140 45 S 220 100, 280 60 S 360 30, 400 50" stroke="#85e6ff" strokeWidth="3" fill="none" />
          <circle cx="300" cy="44" r="7" fill="#ddd7fe" />
          <ellipse cx="300" cy="56" rx="18" ry="4" fill="#85e6ff" />
        </svg>
        <div className="px-6 pb-6 pt-2">
          <h1 className="font-display text-3xl font-bold leading-tight">Surf the market.</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-lavender/90">
            The live price is a wave. Ride the <span className="text-cyan">crest</span> and you&apos;re long. Drop into the{" "}
            <span className="text-pink">trough</span> and you&apos;re short. Every carve is a real trade on Perpl, settled on Monad
            in under a second.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-mute">
            <li>· Log in with a passkey. No seed phrase, no extension.</li>
            <li>· Dollars in AUSD. Small, capped trades with a stop on every ride.</li>
            <li>· Practice free first. Go live when you&apos;re ready.</li>
          </ul>
          <div className="mt-5 grid gap-2">
            <button className="btn btn-primary glow !py-4" onClick={close}>
              Try a free ride
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                close();
                onLogin();
              }}
            >
              Log in with passkey
            </button>
            <a href="/about" className="label py-2 text-center hover:text-lavender">
              How it works · for partners
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
