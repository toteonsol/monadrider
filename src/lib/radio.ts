"use client";
/**
 * Pit radio · the app talking back. One small feed of timely notices:
 *
 *   opportunity  read from Perpl's live market data (big movers, funding that
 *                pays one side, the busiest book), each with a "ride this"
 *   ride         what just happened on a live ride (fills, stops, take-profit, end)
 *   tip          a short lesson tied to what the rider just did
 *
 * Kept in memory (and the last few in this browser), newest first.
 */
import { useSyncExternalStore } from "react";

export interface Notice {
  id: string;
  kind: "opportunity" | "ride" | "tip";
  tone: "good" | "warn" | "info";
  title: string;
  body: string;
  asset?: string;
  tx?: string;
  at: number;
}

let notices: Notice[] = [];
let unread = 0;
const subs = new Set<() => void>();
const seen = new Set<string>();
const emit = () => subs.forEach((f) => f());

try {
  const raw = typeof window !== "undefined" ? localStorage.getItem("rtn-monad-radio") : null;
  if (raw) notices = (JSON.parse(raw) as Notice[]).slice(0, 30);
} catch {}

function persist() {
  try {
    localStorage.setItem("rtn-monad-radio", JSON.stringify(notices.slice(0, 30)));
  } catch {}
}

/** Post a notice. `key` dedupes (e.g. one "MON is the top mover" per hour). */
export function radio(n: Omit<Notice, "id" | "at">, key?: string) {
  if (key) {
    if (seen.has(key)) return;
    seen.add(key);
  }
  notices = [{ ...n, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() }, ...notices].slice(0, 60);
  unread += 1;
  persist();
  emit();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rtn-radio", { detail: notices[0] }));
}

export function markRead() {
  unread = 0;
  emit();
}

let snap = { notices, unread };
function getSnap() {
  if (snap.notices !== notices || snap.unread !== unread) snap = { notices, unread };
  return snap;
}
const server = { notices: [] as Notice[], unread: 0 };

export function useRadio() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getSnap,
    () => server,
  );
}
