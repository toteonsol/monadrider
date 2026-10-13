import { ImageResponse } from "next/og";

/** The project logo, 1000×1000: the wave mark over the wordmark, Monad livery. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1000,
          height: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(70% 60% at 50% 35%, #2a1d63 0%, #0e091c 70%)",
        }}
      >
        <svg width="560" height="360" viewBox="0 0 560 360">
          <path d="M20 260 C 120 260, 150 90, 280 90 S 440 260, 540 180 L 540 360 L 20 360 Z" fill="#6e54ff" />
          <path d="M20 260 C 120 260, 150 90, 280 90 S 440 260, 540 180" stroke="#85e6ff" strokeWidth="22" fill="none" strokeLinecap="round" />
          <circle cx="300" cy="64" r="30" fill="#f3f0ff" />
          <ellipse cx="300" cy="104" rx="70" ry="14" fill="#85e6ff" />
        </svg>
        <div style={{ display: "flex", marginTop: 46, fontSize: 112, fontWeight: 900, letterSpacing: -4, color: "#f3f0ff" }}>
          MONAD<span style={{ color: "#8a74ff", marginLeft: 22 }}>RIDER</span>
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 34, letterSpacing: 8, color: "#a49dc9" }}>DRIVE THE MARKET</div>
      </div>
    ),
    { width: 1000, height: 1000 },
  );
}
