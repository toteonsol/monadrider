/**
 * Logomark · bespoke Hyperider mark. A speedometer gauge whose needle is also a
 * market-up vector, motorsport × fintech in one glyph. Line-art, scales clean
 * from favicon to hero. Pass `size`; colours ride the theme tokens — papaya
 * (the team colour) on a steel dial with a cream needle, the same mark as the
 * app icon. Green stays money-only, so the mark no longer wears it.
 */
export default function Logomark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Hyperider"
    >
      {/* speedo arc (270°, open at bottom-right like a redline) */}
      <path
        d="M24 5 A19 19 0 1 1 40.4 33.5"
        stroke="var(--papaya)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* tick marks */}
      {[210, 240, 270, 300, 330].map((deg) => {
        const r1 = 19, r2 = 15;
        const a = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={24 + r1 * Math.cos(a)}
            y1={24 + r1 * Math.sin(a)}
            x2={24 + r2 * Math.cos(a)}
            y2={24 + r2 * Math.sin(a)}
            stroke="var(--papaya)"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
        );
      })}
      {/* needle = market-up vector, from hub shooting to the redline */}
      <path d="M24 24 L37 13" stroke="var(--bone)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M37 13 l-6 1.5 M37 13 l-1.5 6" stroke="var(--bone)" strokeWidth="3" strokeLinecap="round" />
      {/* hub */}
      <circle cx="24" cy="24" r="3.5" fill="var(--papaya)" />
    </svg>
  );
}
