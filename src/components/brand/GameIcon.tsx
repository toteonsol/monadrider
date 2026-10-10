/**
 * GameIcon · the in-ride HUD icon set, bespoke 2px line-art (currentColor) that
 * replaces the emoji chrome so the game area matches the app's identity. One
 * consistent stroke language across every control.
 */
export type GameIconName =
  | "trophy"
  | "menu"
  | "close"
  | "soundOn"
  | "soundOff"
  | "record"
  | "stop"
  | "share"
  | "paint"
  | "pause"
  | "support"
  | "guide"
  | "exit"
  | "crash";

const P: Record<GameIconName, React.ReactNode> = {
  trophy: (
    <>
      <path d="M7 4h10v3a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M9 20h6M12 14v6" />
    </>
  ),
  menu: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  exit: <path d="M6 6l12 12M18 6L6 18" />,
  soundOn: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </>
  ),
  record: <circle cx="12" cy="12" r="6" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  share: (
    <>
      <path d="M12 3v11M12 3L8 7M12 3l4 4" />
      <path d="M5 12v7h14v-7" />
    </>
  ),
  paint: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-1.4 1-2 2.2-2H18a3 3 0 0 0 3-3c0-5-4-9-9-9z" />
      <circle cx="8" cy="11" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16" cy="11" r="1" />
    </>
  ),
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  support: (
    <>
      <path d="M4 5h16v11H9l-4 4v-4H4z" />
      <path d="M8 10h8M8 13h5" />
    </>
  ),
  guide: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M20 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5z" />
    </>
  ),
  crash: (
    <path d="M12 3l2 5 5-1-3 4 3 4-5-1-2 5-2-5-5 1 3-4-3-4 5 1z" />
  ),
};

export default function GameIcon({
  name,
  size = 16,
  className = "",
}: {
  name: GameIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {P[name]}
    </svg>
  );
}
