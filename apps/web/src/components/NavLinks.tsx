"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  const inStudio = pathname.startsWith("/studio");
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Home
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
