"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";
import { clearDrafts } from "./drafts";

export function LabelHeader({ name, role, home }: { name: string; role: "admin" | "reviewer"; home: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api("/auth/logout", { body: {} });
    } catch {
      // The cookie is cleared either way below by navigating to sign-in.
    }
    clearDrafts();
    window.location.assign("/label/login");
  }

  return (
    <header className="lb-header">
      <nav className="lb-nav glass" aria-label="Labeller">
        <Link href={home} className="lb-brand">
          <span className="lb-bead" aria-hidden="true">
            RR
          </span>
          <span>{role === "admin" ? "Clip labeller admin" : "Clip review"}</span>
        </Link>
        {role === "admin" ? (
          <Link href="/label" className="lb-nav-link">
            Reviewer view
          </Link>
        ) : null}
      </nav>
      <div className="lb-account glass">
        <span className="lb-account-name">{name}</span>
        <button type="button" className="lb-btn lb-btn-quiet" onClick={signOut} disabled={busy}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
