"use client";

/**
 * A sheet that behaves like a dialog for keyboards and screen readers
 * (2026-09-27). None of the app's overlays said what they were, none closed
 * on Escape, and Tab walked straight out onto the page underneath.
 *
 *   const ref = useDialog<HTMLDivElement>(open, onClose);
 *   <div ref={ref} {...dialogProps("your roads and wallets")}>
 *
 * Escape closes the TOP sheet only (a stack, so a sheet opened from a sheet
 * closes first); focus moves into the sheet when it opens and back to what
 * opened it when it closes; Tab cycles inside. The games keep their own
 * Escape handling — they are play surfaces, not sheets.
 */
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const stack: symbol[] = [];

export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = Symbol("dialog");
    stack.push(me);
    const before = document.activeElement as HTMLElement | null;
    // the sheet is mounted by the time an effect runs · focus it now (a paint
    // frame would never come in a background tab, and the sheet would open unfocused)
    const sheet = ref.current;
    if (sheet && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      const el = ref.current;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === el || !el.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !el.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

/** spread on the sheet's outermost element, with the ref from useDialog */
export const dialogProps = (label: string, alert = false) => ({
  role: alert ? ("alertdialog" as const) : ("dialog" as const),
  "aria-modal": true as const,
  "aria-label": label,
  tabIndex: -1,
});
