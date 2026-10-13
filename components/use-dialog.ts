"use client";

import { useEffect, useRef } from "react";

/** Moves focus into a dialog while it is open, keeps Tab inside it, and returns focus on close. */
export function useDialog<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    node.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input, select, iframe, summary, [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", trap);
    return () => { node.removeEventListener("keydown", trap); previous?.focus?.(); };
  }, [open]);
  return ref;
}
