import type { Metadata } from "next";
import { PerplKeyGuide } from "@/components/PerplKeyGuide";

export const metadata: Metadata = {
  title: "Guide · ride your Perpl account · Ride the Now",
  description: "Four steps to trade your existing Perpl account from Ride the Now, and exactly what the key can and can't do.",
};

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(20px+var(--safe-top))]">
      <a href="/" className="display text-[11px] font-bold uppercase tracking-[0.14em] text-flat hover:text-bone">
        ← back to the paddock
      </a>
      <div className="mt-4">
        <PerplKeyGuide page />
      </div>
    </main>
  );
}
