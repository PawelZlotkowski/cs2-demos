"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PillBubble } from "@/components/PillBubble";
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

const links = [
  { href: "/", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  const inReview = pathname.startsWith("/studio/") || pathname.startsWith("/processing/");
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.features().then((features) => {
      window.localStorage.setItem(LAB_KEY, features.lab ? "1" : "0");
    }).catch(() => undefined);
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <nav
      className="nav glass"
      aria-label="Main"
      ref={navRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <Link className="brand-bead" href="/" aria-label="Round Reviewer home" />
      <button
        ref={toggleRef}
        className="nav-toggle"
        type="button"
        aria-label="Navigation"
        aria-controls="main-links"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5h11M2.5 11h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div className="nav-links" id="main-links" data-open={open}>
        <PillBubble value={pathname} />
        {links.map(({ href, label }) => {
          const section = (href === "/matches" && inReview) || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : section ? "location" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
