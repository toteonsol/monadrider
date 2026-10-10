"use client";

/**
 * THE APP IN YOUR LANGUAGE (2026-09-27).
 *
 * Hyperider spoke English only, and most perp-DEX volume is traded by people
 * who read Chinese, Korean, Vietnamese, Turkish, Russian, Spanish or
 * Portuguese first. This is deliberately small:
 *
 *   · the English text IS the key — `t("Go live")`. Anything not yet
 *     translated shows in English, never as a blank or a key name
 *   · `{name}` placeholders: `t("{n} riders", { n })`
 *   · the language comes from the browser until the rider picks one
 *     (remembered in localStorage), and only that language's dictionary is
 *     downloaded
 *   · <html lang> follows it, so a screen reader switches voice too
 *
 * Constants that are rendered later (tour steps, tables) mark their strings
 * with `tx("…")` so scripts/verify-i18n.ts can find every string a
 * dictionary must carry.
 */
import { useSyncExternalStore } from "react";

export const LANGS = [
  { code: "en", name: "English" },
  { code: "zh", name: "简体中文" },
  { code: "ko", name: "한국어" },
  { code: "ja", name: "日本語" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export type Dict = Record<string, string>;

const KEY = "rtn-lang";
const LOAD: Record<Exclude<Lang, "en">, () => Promise<{ default: Dict }>> = {
  zh: () => import("./dict/zh"),
  ko: () => import("./dict/ko"),
  ja: () => import("./dict/ja"),
  es: () => import("./dict/es"),
  pt: () => import("./dict/pt"),
  ru: () => import("./dict/ru"),
  tr: () => import("./dict/tr"),
  vi: () => import("./dict/vi"),
  id: () => import("./dict/id"),
};

let lang: Lang = "en";
let dict: Dict = {};
let started = false;
let applying = 0;
const subs = new Set<() => void>();

const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.code === x);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* private mode · fall through to the browser */
  }
  for (const n of navigator.languages ?? [navigator.language]) {
    const base = String(n).toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

async function apply(next: Lang) {
  const mine = ++applying;
  const d = next === "en" ? {} : (await LOAD[next]()).default;
  if (mine !== applying) return; // a later choice won
  lang = next;
  dict = d;
  document.documentElement.lang = next;
  subs.forEach((f) => f());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const first = detect();
  if (first !== "en") void apply(first);
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice still applies for this visit */
  }
  void apply(next);
}

const subscribe = (f: () => void) => {
  start();
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/** the active language · re-renders when it changes */
export function useLang(): Lang {
  return useSyncExternalStore(
    subscribe,
    () => lang,
    () => "en",
  );
}

const fill = (out: string, vars?: Record<string, string | number>) => {
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
};

export function translate(s: string, vars?: Record<string, string | number>): string {
  return fill(dict[s] ?? s, vars);
}
const english = (s: string, vars?: Record<string, string | number>) => fill(s, vars);

/** const t = useT(); t("Go live") · t("{n} riders", { n })
 *  Bound to the SAME snapshot the render uses: while React hydrates, useLang
 *  answers "en" (what the server rendered), so the text must be English too,
 *  even if a dictionary has already arrived — otherwise React throws #418
 *  (hydration text mismatch). The re-render right after brings the language. */
export function useT(): typeof translate {
  return useLang() === "en" ? english : translate;
}

/** marks a string for the dictionaries without translating it yet · for
 *  constants that a component passes through t() when it renders them */
export const tx = (s: string) => s;

/** "3 hours ago" in the rider's language · the browser already knows how */
export function timeAgo(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(s);
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60 ? [s, "second"] : abs < 3600 ? [Math.round(s / 60), "minute"] : abs < 172800 ? [Math.round(s / 3600), "hour"] : [Math.round(s / 86400), "day"];
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" }).format(n, unit);
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" }).format(n, unit);
  }
}
