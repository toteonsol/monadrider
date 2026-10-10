/**
 * Icon · the bespoke UI glyph set, one stroke language with VenueMark and
 * Logomark (24×24 grid, 2px stroke, round caps, currentColor). This is what
 * replaces the emoji era: every surface icon is DRAWN, tinted by the theme,
 * and reads at 14px or 40px alike. Add glyphs here, never reach for emoji
 * in app chrome again (in-world game popups keep their playful voice).
 */
export type IconName =
  | "trophy"
  | "airdrop"
  | "lab"
  | "convoy"
  | "allroads"
  | "doctor"
  | "gem"
  | "portal"
  | "play"
  | "shop"
  | "arcade"
  | "invite"
  | "spark"
  | "wallet"
  | "shield"
  | "flag"
  | "scale"
  | "globe"
  | "bell"
  | "warn"
  | "refresh"
  | "share"
  | "pause"
  | "stop"
  | "storm"
  | "eject";

const GLYPHS: Record<IconName, React.ReactNode> = {
  // laurels-free trophy, the hub's board
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </>
  ),
  // parachute drop, campaigns / airdrops
  airdrop: (
    <>
      <path d="M4 10a8 8 0 0 1 16 0" />
      <path d="M4 10l8 9 8-9" />
      <path d="M9.5 10L12 19M14.5 10L12 19" />
      <circle cx="12" cy="20.5" r="1.4" />
    </>
  ),
  // flask, the research lab
  lab: (
    <>
      <path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M8.5 3h7M8 14h8" />
    </>
  ),
  // convoy truck, ride together
  convoy: (
    <>
      <path d="M3 7h10v9H3z" />
      <path d="M13 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="16.5" cy="18" r="1.8" />
    </>
  ),
  // one road splitting into three, all roads at once
  allroads: (
    <>
      <path d="M12 21v-6" />
      <path d="M12 15c0-4-7-4-7-9V3M12 15c0-4 7-4 7-9V3" />
      <path d="M12 15V3" strokeDasharray="2 3" />
    </>
  ),
  // pulse in a circle, the connection doctor
  doctor: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 12h3l2-4 3 8 2-4h3" />
    </>
  ),
  // faceted gem, whale prints
  gem: (
    <>
      <path d="M7 4h10l4 5-9 11L3 9l4-5z" />
      <path d="M3 9h18M9.5 9L12 20M14.5 9L12 20M7 4l2.5 5M17 4l-2.5 5" />
    </>
  ),
  // regime ring over the road
  portal: (
    <>
      <ellipse cx="12" cy="10" rx="7" ry="8" />
      <path d="M4 21h16" />
      <path d="M9 21c0-2 1.2-3.5 3-3.5s3 1.5 3 3.5" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5z" />,
  // wrench, in the shop
  shop: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3a2 2 0 1 0 2.8 2.8l4.9-4.9a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.1-2.1 2.6-2.6z" />
    </>
  ),
  // d-pad, the arcade
  arcade: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="4" />
      <path d="M8 11v4M6 13h4" />
      <circle cx="15.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  // chain link, invites / referrals
  invite: (
    <>
      <path d="M10 14a4 4 0 0 1 0-5.7l2.3-2.3a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 1 0 5.7l-2.3 2.3a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    </>
  ),
  spark: <path d="M13 3L6 13h5l-1 8 7-10h-5l1-8z" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h12l-2.5 4L18 12H6" />
    </>
  ),
  // balance scale, the delta-neutral Desk
  scale: (
    <>
      <path d="M12 4v16M8 20h8" />
      <path d="M12 6l-6 2m6-2l6 2" />
      <path d="M6 8l-2.5 5a3 3 0 0 0 5 0L6 8zM18 8l-2.5 5a3 3 0 0 0 5 0L18 8z" />
    </>
  ),
  // globe, ranks / world
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16-2.5-2.6-2.5-13.4 0-16z" />
    </>
  ),
  // bell, the notices dock
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  // a warning triangle · the line-art stand-in for every "⚠" the chrome used to print
  warn: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5v.01" />
    </>
  ),
  // a circular arrow · re-read, refresh, a new version
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  // an arrow leaving a tray · share
  share: (
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </>
  ),
  pause: (
    <>
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  stop: <path d="M7 7h10v10H7z" />,
  // a cloud with a bolt · the market storm
  storm: (
    <>
      <path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.5a3.25 3.25 0 0 1 .5 6.47" />
      <path d="M12.5 12l-2 4h3l-2 4" />
    </>
  ),
  // the eject mark · disconnect, forget this browser's key
  eject: (
    <>
      <path d="M6 14l6-7 6 7H6z" />
      <path d="M6 18h12" />
    </>
  ),
};

export default function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {GLYPHS[name]}
    </svg>
  );
}
