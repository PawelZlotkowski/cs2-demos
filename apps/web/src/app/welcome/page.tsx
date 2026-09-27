"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { COACH_LANGUAGES, useCoachLanguage } from "@/lib/coach/language";
import { errorText } from "@/lib/format";

/** First step after an account is made (A05): coach language, Steam, and consent in study mode. */
export default function WelcomePage() {
  const { state, user, refresh } = useAuth();
  const [lang, setLang] = useCoachLanguage();
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <main className="main narrow" id="content" aria-busy="true" />;

  async function done() {
    setError(null);
    try {
      if (state?.needsConsent) await api.consent();
      await refresh();
      window.location.replace("/");
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <main className="main narrow page-settings" id="content">
      <h1>Welcome, {user.displayName}</h1>
      <p className="meta">Two things before your first review. You can change both later in Settings.</p>

      <section className="settings-sec" aria-labelledby="lang-h">
        <h2 id="lang-h">Coach language</h2>
        <div className="seg seg-plain" role="group" aria-labelledby="lang-h">
          {COACH_LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={lang === l.id}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-sec" aria-labelledby="steam-h">
        <h2 id="steam-h">Steam</h2>
        {user.steamId ? (
          <p className="meta">
            Linked. When your SteamID is in a demo, the coach reviews you without asking who you played as.
          </p>
        ) : (
          <p className="meta">
            Link Steam and the coach picks you in every demo you upload.{" "}
            <a href={api.steamStartUrl({ link: true, next: "/welcome" })}>Link Steam</a>
          </p>
        )}
      </section>

      {state?.needsConsent ? (
        <section className="settings-sec" aria-labelledby="consent-h">
          <h2 id="consent-h">Taking part in the study</h2>
          <p className="meta">
            This app is part of a school project. Your feedback, questions and how you use the coach are exported for the
            report under a code, never with your name or SteamID. You can delete your account and data at any time in Settings.
          </p>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to take part
          </label>
        </section>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
      <p className="row-actions">
        <button type="button" className="btn btn-fill" disabled={!!state?.needsConsent && !agree} onClick={() => void done()}>
          Start
        </button>
        {!state?.needsConsent ? <Link href="/">Skip</Link> : null}
      </p>
    </main>
  );
}
