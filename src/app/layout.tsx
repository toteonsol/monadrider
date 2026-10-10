import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--nf-inter" });
const display = Inter_Tight({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--nf-display" });
const mono = Roboto_Mono({ subsets: ["latin"], variable: "--nf-mono" });

export const metadata: Metadata = {
  title: "Ride the Now · Monad",
  description: "Surf the live price wave. Every carve is a real Perpl trade on Monad, funded in AUSD.",
  applicationName: "Ride the Now",
  appleWebApp: { capable: true, title: "Ride the Now", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
};

export const viewport: Viewport = {
  themeColor: "#0e091c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
