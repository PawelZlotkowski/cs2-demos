import type { ReactNode } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { ThemeSelect, themeBootScript } from "@/components/ThemeSelect";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource-variable/archivo/wdth.css";
import "@/styles/tokens.css";
import "@/styles/studio.css";

export const metadata = {
  title: { default: "Round Reviewer", template: "%s · Round Reviewer" },
  description: "Pick a player in a CS2 demo and review their best and worst moments with a self-hosted coach.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // No data-theme by default: the chrome follows the system setting until the user picks one.
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className="brand-text">Round Reviewer</span>
            </Link>
            <NavLinks />
            {/* Studio portals the loaded match summary in here. */}
            <div className="bar-match" id="bar-match" />
            <div className="spacer" />
            <ThemeSelect />
            <Link href="/upload" className="btn btn-line">
              <span className="hide-s">Add match</span>
              <span className="show-s">Add</span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
