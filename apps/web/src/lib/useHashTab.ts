"use client";

import { useCallback, useEffect, useState } from "react";

/** A page's sub-tab kept in the URL hash (#plan), so a reload or a shared link opens the same tab. */
export function useHashTab<T extends string>(ids: readonly T[], fallback: T): [T, (id: T) => void] {
  const [tab, setTab] = useState<T>(fallback);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as T;
      setTab(ids.includes(h) ? h : fallback);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // ids is a constant list at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  const go = useCallback((id: T) => {
    window.history.replaceState(null, "", `#${id}`);
    setTab(id);
  }, []);

  return [tab, go];
}
