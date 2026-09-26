import type { ReactNode } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import "@/styles/tokens.css";
import "@/styles/studio.css";

export const metadata = {
  title: "Round Reviewer",
  description: "Review CS2 demo rounds on Radar with a shared playback clock.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Newsreader:ital,wght@0,400;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              Round Reviewer
            </Link>
            <NavLinks />
            {/* Studio portals the loaded match summary in here. */}
            <div className="bar-match" id="bar-match" />
            <div className="spacer" />
            <Link href="/upload" className="btn btn-line">
              <span className="hide-s">Add demo</span>
              <span className="show-s">Add</span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
