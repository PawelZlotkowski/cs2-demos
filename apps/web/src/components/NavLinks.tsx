"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";

const LAB_KEY = "rr.lab";

/** Whether the Lab is on, as last seen by the nav (for "How this was written" links). */
export function labRemembered(): boolean {
  try {
    return window.localStorage.getItem(LAB_KEY) === "1";
  } catch {
    return false;
  }
}

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  const inStudio = pathname.startsWith("/studio");
  const [lab, setLab] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Remembered per browser so the link does not pop in on every page; refreshed in the background.
    try {
      setLab(window.localStorage.getItem(LAB_KEY) === "1");
    } catch {
      /* storage blocked */
    }
    api
      .features()
      .then((f) => {
        setLab(f.lab);
        try {
          window.localStorage.setItem(LAB_KEY, f.lab ? "1" : "0");
        } catch {
          /* storage blocked */
        }
      })
      .catch(() => undefined);
  }, []);

  // When the bar is short of room the nav scrolls; fade the edge that has more links behind it.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const more = nav.scrollWidth - nav.clientWidth;
      nav.dataset.fade = more <= 1 ? "" : `${nav.scrollLeft > 1 ? "l" : ""}${nav.scrollLeft < more - 1 ? "r" : ""}`;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    nav.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, [lab, inStudio]);

  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);
  return (
    <nav className="nav" aria-label="Main" ref={navRef}>
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Home
      </Link>
      <Link href="/matches" aria-current={current("/matches")}>
        Matches
      </Link>
      <Link href="/progress" aria-current={current("/progress")}>
        Progress
      </Link>
      <Link href="/coach" aria-current={current("/coach")}>
        Coach
      </Link>
      {/* Studio needs a match; it only appears once one is open. */}
      {inStudio ? (
        <Link href={pathname} aria-current="page">
          Studio
        </Link>
      ) : null}
    </nav>
  );
}
