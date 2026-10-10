"use client";

/**
 * The language switch · a native select (every phone and screen reader
 * already knows how to drive one). `compact` shows just the globe and the
 * code, for the phone header and the rail footer; the select still covers
 * the whole chip, so a tap anywhere opens the real list.
 */
import Icon from "./brand/Icon";
import { LANGS, setLang, useLang, useT, type Lang } from "@/lib/i18n";

export default function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  const here = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <label
      className={`relative inline-flex shrink-0 items-center gap-1.5 border border-steel text-flat transition focus-within:border-papaya hover:border-sky hover:text-sky ${
        compact ? "h-9 px-2" : "px-2.5 py-1.5"
      }`}
      title={t("Language")}
    >
      <Icon name="globe" size={15} />
      <span className="display text-[11px] font-bold uppercase tracking-wide" aria-hidden>
        {compact ? here.code : here.name}
      </span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t("Language")}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
