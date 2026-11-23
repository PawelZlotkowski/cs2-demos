"use client";

import { useLayoutEffect, useRef } from "react";

/** Position the shared highlight under the track's selected link, button or tab. */
export function PillBubble({ value }: { value: string | number | boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pointer = useRef(false);

  useLayoutEffect(() => {
    const track = ref.current?.parentElement;
    if (!track) return;
    const onClick = (event: MouseEvent) => {
      pointer.current = event.detail > 0;
    };
    const onKey = () => {
      pointer.current = false;
    };
    track.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      track.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    const bubble = ref.current;
    const track = bubble?.parentElement;
    if (!track || !bubble) return;
    const active = track.querySelector<HTMLElement>(
      ':scope > [aria-current], :scope > [aria-selected="true"], :scope > [aria-pressed="true"], :scope > label:has(input:checked)',
    );
    const measure = () => {
      if (!active) {
        track.removeAttribute("data-measured");
        return;
      }
      const rect = active.getBoundingClientRect();
      const origin = track.getBoundingClientRect();
      const x = rect.left - origin.left + track.scrollLeft;
      const y = rect.top - origin.top + track.scrollTop;
      bubble.style.width = `${rect.width}px`;
      bubble.style.height = `${rect.height}px`;
      bubble.style.transform = `translate(${x}px, ${y}px)`;
      track.toggleAttribute("data-measured", rect.width > 0);
    };
    track.toggleAttribute("data-slide", pointer.current && track.hasAttribute("data-measured"));
    pointer.current = false;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const control of track.querySelectorAll(":scope > a, :scope > button, :scope > label")) observer.observe(control);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref} className="pill-bubble" aria-hidden="true" />;
}
