import type { ReactNode } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SystemNotice, SystemProvider } from "@/components/SystemNotice";
import "@fontsource-variable/mona-sans/wdth.css";
import "@/styles/tokens.css";
import "@/styles/studio.css";
import "@/styles/pages.css";
import "@/styles/admin.css";

// RR_WEB_MODE=clip-labeller (the hosted clip labeller) uses a minimal shell without the
// FastAPI-backed AuthProvider and Studio header; app/label/layout.tsx draws its own chrome.
const LABELLER = process.env.RR_WEB_MODE === "clip-labeller";

export const metadata = LABELLER
  ? {
      title: { default: "Round Reviewer clips", template: "%s – Round Reviewer clips" },
      description: "Watch assigned Counter-Strike 2 clips and write what the selected player did well or could improve.",
      robots: { index: false, follow: false },
    }
  : {
      title: { default: "Round Reviewer", template: "%s · Round Reviewer" },
      description: "Pick a player in a CS2 demo and review their best and worst moments with a self-hosted coach.",
    };

export default function RootLayout({ children }: { children: ReactNode }) {
  if (LABELLER) {
    return (
      <html lang="en-GB">
        <body className="lb-body">
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          {children}
        </body>
      </html>
    );
  }
  return (
    <html lang="en-GB">
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <AuthProvider><SystemProvider>
          <div className="shell">
            <header className="topbar">
              <NavLinks />
              <div className="bar-match glass" id="bar-match" />
              <div className="bar-actions">
                <SystemNotice />
                <Link href="/upload" className="btn btn-fill bar-add" aria-label="Add match">
                  <svg className="bar-add-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span>Add match</span>
                </Link>
                <AccountMenu />
              </div>
            </header>
            {children}
          </div>
        </SystemProvider></AuthProvider>
      </body>
    </html>
  );
}
