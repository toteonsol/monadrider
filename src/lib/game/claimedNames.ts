/**
 * 🏷 CLAIMED NAMES, ON EVERY SCREEN · one small store the name chips read.
 *
 * Every rider chip asks for its code's claimed name; asks made in the same
 * moment are batched into one query (the standings render 20 chips at once),
 * answers are cached for the session, and a fresh claim updates every chip
 * that shows that rider without a reload. No claim → the generated alias,
 * exactly as before.
 */
import { useSyncExternalStore } from "react";
import { fetchClaimedNames } from "./backend";

const names = new Map<string, string | null>(); // null = asked, no claim
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function flush() {
  timer = null;
  const codes = [...pending];
  pending = new Set();
  if (!codes.length) return;
  void fetchClaimedNames(codes).then((rows) => {
    for (const c of codes) if (!names.has(c)) names.set(c, null);
    for (const r of rows) names.set(r.code.toLowerCase(), r.name);
    emit();
  });
}

function want(code: string) {
  const c = code.toLowerCase();
  if (!c || names.has(c) || pending.has(c)) return;
  pending.add(c);
  if (!timer) timer = setTimeout(flush, 40);
}

/** a fresh claim, shown everywhere at once */
export function setClaimedName(code: string, name: string) {
  names.set(code.toLowerCase(), name);
  emit();
}

/** the rider's claimed name, or null (use the alias) · re-renders on arrival */
export function useClaimedName(code: string): string | null {
  const c = (code || "").toLowerCase();
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  if (typeof window !== "undefined") want(c);
  return names.get(c) ?? null;
}
