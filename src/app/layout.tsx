import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// The Grand Prix type system, self-hosted (OFL, see public/fonts/LICENSE.md):
// Unbounded for display, Archivo for body, Geist Mono for telemetry only.
const unbounded = localFont({
  src: "../../public/fonts/unbounded.woff2",
  variable: "--font-unbounded",
  weight: "500 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
const archivo = localFont({
  src: "../../public/fonts/archivo.woff2",
  variable: "--font-archivo",
  weight: "400 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
const geistMono = localFont({
  src: "../../public/fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "400 700",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Monad Rider · drive the market on Monad",
  description:
    "A racing, surfing and rhythm game where every move is a real, capped Perpl trade on Monad. Passkey login, AUSD margin, spot on Kuru. Free practice first.",
  applicationName: "Monad Rider",
  appleWebApp: { capable: true, title: "Monad Rider", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
};

export const viewport: Viewport = {
  themeColor: "#0e091c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${archivo.variable} ${geistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
