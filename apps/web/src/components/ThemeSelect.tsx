"use client";

import { useEffect, useId, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "rr.theme";

/** Runs before first paint (inlined in <head>) so a stored theme never flashes. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function ThemeSelect() {
  const id = useId();
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") setChoice(stored);
    } catch {
      // Storage blocked: follow the system setting.
    }
  }, []);

  function change(next: ThemeChoice) {
    setChoice(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Not stored; the choice still applies to this page.
    }
  }

  return (
    <span className="theme-select">
      <label htmlFor={id} className="sr-only">
        Colour theme
      </label>
      <select id={id} value={choice} onChange={(e) => change(e.target.value as ThemeChoice)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </span>
  );
}
