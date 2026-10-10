import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** App icon: a purple wave on Monad ink, rendered at the requested size. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = SIZES.has(n) ? n : 192;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", background: "#0e091c" }}>
        <svg width={size} height={size} viewBox="0 0 512 512">
          <path
            d="M48 330 C 130 330, 150 170, 256 170 S 380 330, 464 260 L 464 464 L 48 464 Z"
            fill="#6e54ff"
          />
          <path
            d="M48 330 C 130 330, 150 170, 256 170 S 380 330, 464 260"
            stroke="#85e6ff"
            strokeWidth={22}
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="256" cy="150" r={34} fill="#ddd7fe" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
