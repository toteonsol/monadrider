import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** Monad Rider app icon: the wave tile with the rider on the crest. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = SIZES.has(n) ? n : 192;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", background: "#6e54ff" }}>
        <svg width={size} height={size} viewBox="0 0 512 512">
          <rect width="512" height="512" fill="#6e54ff" />
          <path d="M0 330 C 110 330, 150 175, 260 175 S 420 300, 512 380 L 512 512 L 0 512 Z" fill="#0e091c" />
          <path d="M0 330 C 110 330, 150 175, 260 175 S 420 300, 512 380" stroke="#85e6ff" strokeWidth="26" fill="none" strokeLinecap="round" />
          <ellipse cx="262" cy="150" rx="66" ry="14" fill="#85e6ff" />
          <circle cx="262" cy="86" r="28" fill="#f3f0ff" />
          <rect x="255" y="110" width="14" height="30" fill="#f3f0ff" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
