/**
 * Motion helpers (11 Motion system, Emil Kowalski's rules): transform and opacity only,
 * ease-out for entering, ease-in-out for moving, nothing on keyboard actions, and
 * nothing at all under prefers-reduced-motion.
 */

/** Strong ease-out for UI; the same curve as --ease-out in tokens.css. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Strong ease-in-out for on-screen movement; --ease-in-out in tokens.css. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * FLIP: the element has already moved to its new layout; play it from where it was.
 * `first` is the rect measured before the change.
 */
export function flipFrom(
  el: Element,
  first: DOMRect,
  { duration = 240, easing = EASE_IN_OUT, scale = true }: { duration?: number; easing?: string; scale?: boolean } = {},
): void {
  if (reducedMotion()) return;
  const last = el.getBoundingClientRect();
  if (!last.width || !last.height) return;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = scale ? first.width / last.width : 1;
  const sy = scale ? first.height / last.height : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  el.animate(
    [
      { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: "0 0", transform: "none" },
    ],
    { duration, easing },
  );
}

/** A short opacity-only entrance for content that was swapped in place. */
export function fadeIn(el: Element | null, duration = 140): void {
  if (!el || reducedMotion()) return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_OUT });
}
