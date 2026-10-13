"use client";
/**
 * The newbie's guide to "Use my existing Perpl account": four illustrated
 * steps, then the plain answers to "is this safe?" and "why a key?".
 * Used as a sheet from the cockpit and as the /guide page.
 */
import { useState } from "react";

const STEPS = [
  {
    n: "01",
    title: "Open Perpl's API keys page",
    body: "Go to app.perpl.xyz/apikeys and connect the same wallet you already trade with on Perpl. That wallet owns your account and your AUSD.",
    art: "page",
  },
  {
    n: "02",
    title: "Create a key with the trade scope",
    body: "Create a new key and give it the trade permission (trade also lets it read). Name it anything, like “ride the now”. Your wallet signs once to approve it.",
    art: "create",
  },
  {
    n: "03",
    title: "Copy the key and the secret",
    body: "Perpl shows two values: the API key and its secret. Copy both. The secret is shown once, so keep the tab open until you have pasted it.",
    art: "copy",
  },
  {
    n: "04",
    title: "Paste them here and connect",
    body: "In Trade → My Perpl account, paste both and tap connect. Your account number and free AUSD appear and the lights turn green. Pick a world and ride.",
    art: "paste",
  },
] as const;

export function PerplKeyGuide({ onClose, page = false }: { onClose?: () => void; page?: boolean }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const body = (
    <div className={page ? "" : "max-h-[88dvh] overflow-y-auto"}>
      <div className="checker h-[6px] w-full opacity-80" aria-hidden />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="display text-[11px] font-bold uppercase tracking-[0.16em] text-papaya">Guide · 2 minutes</div>
            <h2 className="display mt-1 text-[22px] font-black uppercase leading-tight text-bone">Ride your Perpl account</h2>
            <p className="mt-1 text-[12.5px] text-flat">Use the account and the AUSD you already have on Perpl. No transfers, no gas.</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="display shrink-0 border-2 border-steel px-3 py-1.5 text-[11px] font-bold uppercase text-flat hover:text-bone">
              ✕ close
            </button>
          )}
        </div>

        {/* step rail */}
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="steps">
          {STEPS.map((x, k) => (
            <li key={x.n}>
              <button onClick={() => setI(k)} className="w-full text-left" aria-current={k === i ? "step" : undefined}>
                <span className={`block h-[5px] ${k < i ? "bg-chart" : k === i ? "bg-papaya" : "bg-steel/60"}`} />
                <span className={`display mt-1 block text-[10px] font-black ${k === i ? "text-papaya" : "text-flat-dim"}`}>{x.n}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-3 grid gap-4 min-[640px]:grid-cols-[1fr_1.1fr]">
          <Art kind={s.art} />
          <div>
            <div className="display text-[11px] font-bold uppercase tracking-[0.14em] text-flat">step {s.n}</div>
            <div className="display mt-1 text-[18px] font-black leading-tight text-bone">{s.title}</div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-flat">{s.body}</p>
            {i === 0 && (
              <a
                href="https://app.perpl.xyz/apikeys"
                target="_blank"
                rel="noreferrer"
                className="gp-btn display mt-3 inline-block border-2 border-papaya px-4 py-2 text-[12px] font-black uppercase text-papaya hover:bg-papaya hover:text-ink"
              >
                open app.perpl.xyz/apikeys ↗
              </a>
            )}
            <div className="mt-4 flex gap-2">
              <button disabled={i === 0} onClick={() => setI(i - 1)} className="gp-btn display border-2 border-steel px-4 py-2 text-[12px] font-bold uppercase text-flat disabled:opacity-30">
                ← back
              </button>
              {i < STEPS.length - 1 ? (
                <button onClick={() => setI(i + 1)} className="gp-btn gp-btn-primary display border-2 border-papaya bg-papaya px-4 py-2 text-[12px] font-black uppercase text-ink">
                  next →
                </button>
              ) : (
                onClose && (
                  <button onClick={onClose} className="gp-btn gp-btn-primary display border-2 border-papaya bg-papaya px-4 py-2 text-[12px] font-black uppercase text-ink">
                    got it · connect
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* safety, plainly */}
        <div className="mt-6 border-2 border-steel">
          <div className="border-b-2 border-steel px-4 py-2.5">
            <span className="display text-[11px] font-bold uppercase tracking-[0.14em] text-flat">Is this safe? What the key can and can&apos;t do</span>
          </div>
          <div className="grid min-[640px]:grid-cols-2">
            <Fact ok title="It can place and cancel trades" body="That is all the trade scope allows. Every order the app sends stays inside your rails: small capped size, a stop, a max loss, and it closes on every exit." />
            <Fact ok={false} title="It can never withdraw or move money" body="Perpl does not allow withdrawals or transfers through any API key, whatever its permissions. Your AUSD can only leave your account from your own wallet." />
            <Fact ok title="The secret stays in this browser" body="It is saved only on this device (browser storage) and is used to sign in to Perpl. It is never sent to our servers, and the relay that carries your orders only passes along messages that are already signed." />
            <Fact ok title="You can switch it off any time" body="Tap disconnect here to forget it on this device, and revoke the key on app.perpl.xyz/apikeys to switch it off everywhere. Revoked keys stop working at once." />
          </div>
        </div>

        {/* why a key */}
        <details className="mt-3 border-2 border-steel px-4 py-3 text-[12.5px] leading-relaxed text-flat">
          <summary className="display cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-bone">Why paste a key? Couldn&apos;t my wallet just sign?</summary>
          <p className="mt-2">
            It could, and that is the smoothest way: your wallet signs once, the key is made for you, nothing to copy. Perpl only accepts that
            one-signature request from websites it has approved, a safety check so a strange site can&apos;t make keys in your name. Until this
            app is on that list, the key is created on Perpl&apos;s own page and pasted here.
          </p>
          <p className="mt-2">
            Signing every trade with your wallet instead would mean a pop-up on every lane change, which doesn&apos;t work in a game.
          </p>
          <p className="mt-2">
            <b className="text-bone">The other way in is the passkey wallet.</b> Mera turns your Face ID or fingerprint into a Monad wallet that
            signs each order inside the app, with no key to paste and no pop-ups. It is a new wallet, so it starts empty: send it about 15 AUSD
            (Agora&apos;s dollar, the one Perpl uses for margin) and a little MON for gas, then deposit from Money.
          </p>
        </details>

        {/* one-click */}
        <p className="mt-3 text-[11.5px] leading-relaxed text-flat-dim">
          Tip: orders from a key are sent onchain by Perpl for you (“one-click trading”), and Perpl pays the gas. If the cockpit says one-click
          trading is off, switch it on in your Perpl settings at perpl.xyz.
        </p>
      </div>
    </div>
  );
  if (page) return <div className="border-2 border-steel bg-ink-soft">{body}</div>;
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full border-2 border-steel bg-ink-soft pb-[var(--safe-bottom)] sm:max-w-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Guide">
        {body}
      </div>
    </div>
  );
}

function Fact({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  return (
    <div className="flex gap-3 border-b border-hairline px-4 py-3 last:border-b-0 min-[640px]:[&:nth-child(odd)]:border-r min-[640px]:[&:nth-child(n+3)]:border-b-0">
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center border-2 text-[12px] font-black ${ok ? "border-chart text-chart" : "border-blood text-blood"}`}>{ok ? "✓" : "✕"}</span>
      <span>
        <span className="display block text-[13px] font-bold text-bone">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-flat">{body}</span>
      </span>
    </div>
  );
}

/** Simple drawn screens for each step · not screenshots of Perpl, just the shape of the task. */
function Art({ kind }: { kind: (typeof STEPS)[number]["art"] }) {
  const frame = "relative aspect-[4/3] w-full overflow-hidden border-2 border-steel bg-ink";
  const bar = (
    <div className="flex items-center gap-1.5 border-b-2 border-steel px-2.5 py-1.5">
      <span className="h-2 w-2 rounded-full bg-steel" />
      <span className="h-2 w-2 rounded-full bg-steel" />
      <span className="ml-2 flex-1 truncate border border-hairline bg-ink-soft px-2 py-0.5 font-telemetry text-[10px] text-flat">
        {kind === "paste" ? "ride-the-now-monad.vercel.app · trade" : "app.perpl.xyz/apikeys"}
      </span>
    </div>
  );
  return (
    <div className={frame} aria-hidden>
      {bar}
      <div className="p-3">
        {kind === "page" && (
          <>
            <div className="display text-[13px] font-black text-bone">API keys</div>
            <div className="mt-2 h-2 w-3/4 bg-steel/60" />
            <div className="mt-1.5 h-2 w-1/2 bg-steel/40" />
            <div className="mt-4 inline-flex items-center gap-2 border-2 border-papaya px-3 py-1.5 text-[11px] font-black uppercase text-papaya">
              <span className="h-2 w-2 rounded-full bg-chart" /> connect wallet
            </div>
            <Pointer x="62%" y="62%" />
          </>
        )}
        {kind === "create" && (
          <>
            <div className="display text-[13px] font-black text-bone">New key</div>
            <div className="mt-2 border border-hairline bg-ink-soft px-2 py-1 text-[11px] text-flat">name: ride the now</div>
            <div className="mt-2 flex gap-2 text-[11px]">
              <span className="border border-hairline px-2 py-1 text-flat">☐ read</span>
              <span className="border-2 border-papaya px-2 py-1 font-bold text-papaya">☑ trade</span>
            </div>
            <div className="mt-3 inline-block bg-papaya px-3 py-1.5 text-[11px] font-black uppercase text-ink">create · sign once</div>
            <Pointer x="36%" y="58%" />
          </>
        )}
        {kind === "copy" && (
          <>
            <div className="display text-[13px] font-black text-bone">Your new key</div>
            {["API key", "secret"].map((k) => (
              <div key={k} className="mt-2 flex items-center gap-2">
                <span className="w-14 text-[10px] uppercase text-flat">{k}</span>
                <span className="flex-1 truncate border border-hairline bg-ink-soft px-2 py-1 font-telemetry text-[10px] text-bone">
                  {k === "secret" ? "••••••••••••••••••••" : "pk_live_7f3a…"}
                </span>
                <span className="border-2 border-chart px-1.5 py-0.5 text-[10px] font-black text-chart">copy</span>
              </div>
            ))}
            <div className="mt-3 text-[10px] text-amber">the secret is shown once</div>
            <Pointer x="86%" y="62%" />
          </>
        )}
        {kind === "paste" && (
          <>
            <div className="flex">
              <span className="flex-1 border-2 border-papaya bg-papaya/15 px-2 py-1 text-[10px] font-black uppercase text-papaya">my perpl account</span>
              <span className="flex-1 border-2 border-steel px-2 py-1 text-[10px] font-bold uppercase text-flat">passkey wallet</span>
            </div>
            <div className="mt-2 border-2 border-steel bg-ink-soft px-2 py-1 text-[10px] text-flat">API key ▏</div>
            <div className="mt-1.5 border-2 border-steel bg-ink-soft px-2 py-1 text-[10px] text-flat">secret ••••••</div>
            <div className="mt-2 bg-papaya px-3 py-1.5 text-center text-[10px] font-black uppercase text-ink">connect my perpl account</div>
            <div className="mt-2 flex gap-1">
              {[0, 1, 2, 3].map((k) => (
                <span key={k} className="flex flex-1 items-center gap-1 border border-chart/50 px-1 py-0.5 text-[8px] text-bone">
                  <span className="h-1.5 w-1.5 rounded-full bg-chart" /> ok
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Pointer({ x, y }: { x: string; y: string }) {
  return (
    <svg className="absolute h-6 w-6 motion-safe:animate-bounce" style={{ left: x, top: y }} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 3l14 7-6 2-2 6z" fill="#f3f0ff" stroke="#0e091c" strokeWidth="1.5" />
    </svg>
  );
}
