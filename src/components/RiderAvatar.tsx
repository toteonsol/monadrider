"use client";

/**
 * 🪪 RiderAvatar · a face for a rider code: initials on the rider's own hue,
 * squared and steel-edged like every other plate in the paddock. Same code,
 * same face, on every screen.
 *
 * A rider who has CLAIMED a name (signed with their wallet, see
 * riderNameRules) shows it instead of the generated alias, with a small tick
 * that says so; the code's tag stays beside it so two riders never blur.
 */
import { riderAlias } from "@/lib/game/riderName";
import { useClaimedName } from "@/lib/game/claimedNames";

function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? w[0]?.[1] ?? "")).toUpperCase();
}

export default function RiderAvatar({ code, size = 32, you = false }: { code: string; size?: number; you?: boolean }) {
  const a = riderAlias(code);
  const claimed = useClaimedName(code);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border-2 font-black ${you ? "border-papaya" : "border-steel"}`}
      style={{
        width: size,
        height: size,
        background: `hsl(${a.hue} 55% 18%)`,
        color: `hsl(${a.hue} 90% 72%)`,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontFamily: "var(--font-display)",
        letterSpacing: "0.02em",
      }}
    >
      {claimed ? initialsOf(claimed) : a.initials}
    </span>
  );
}

/** "Papaya Falcon #hra5" · the name bold, the tag quiet · `link` opens the rider's public page */
export function RiderName({
  code,
  you = false,
  className = "",
  link = false,
}: {
  code: string;
  you?: boolean;
  className?: string;
  link?: boolean;
}) {
  const a = riderAlias(code);
  const claimed = useClaimedName(code);
  const body = (
    <>
      <span className={`truncate font-extrabold ${you ? "text-papaya" : "text-bone"}`}>{claimed ?? a.name}</span>
      {claimed && (
        <span className="shrink-0 text-[0.8em] font-black text-chart" title="a name this rider claimed with their wallet">
          ✓
        </span>
      )}
      <span className="shrink-0 font-mono text-[0.82em] text-flat">{a.tag}</span>
      {you && <span className="shrink-0 text-[0.82em] font-bold uppercase text-papaya">you</span>}
    </>
  );
  return link ? (
    <a
      href={`/r/${code}`}
      className={`inline-flex min-w-0 items-baseline gap-1.5 underline-offset-4 hover:underline ${className}`}
      title="open this rider's page"
    >
      {body}
    </a>
  ) : (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`}>{body}</span>
  );
}
