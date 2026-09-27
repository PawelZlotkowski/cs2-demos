"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);
  return (
    <nav className="nav" aria-label="Main">
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
      {lab ? (
        <Link href="/lab" aria-current={current("/lab")}>
          Lab
        </Link>
      ) : null}
    </nav>
  );
}
