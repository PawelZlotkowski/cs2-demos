"use client";

import { PillBubble } from "@/components/PillBubble";

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
  const [busy, setBusy] = useState(false);

  if (!user) return <main className="main narrow" id="content" aria-busy="true" />;

  async function done() {
    setBusy(true);
    setError(null);
    try {
      if (state?.needsConsent) await api.consent();
      await refresh();
      window.location.replace("/");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <main className="main narrow signin" id="content">
      <h1>Welcome, {user.displayName}</h1>
      <p className="lede">Set up the coach before your first review. You can change this later in Settings.</p>

      <section aria-labelledby="lang-h">
        <h2 id="lang-h">Coach language</h2>
        <div className="seg seg-plain" role="group" aria-labelledby="lang-h">
          <PillBubble value={lang} />
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

      {/* Linking needs Steam sign-in set up on the API; without it the link would only fail. */}
      {user.steamId || state?.steam ? (
        <section aria-labelledby="steam-h">
          <h2 id="steam-h">Steam</h2>
          {user.steamId ? (
            <p className="meta">
              Linked. When your SteamID is in a demo, the coach reviews you without asking who you played as.
            </p>
          ) : (
            <>
              <p className="meta">Link Steam and the coach picks you in every demo you upload.</p>
              <a className="btn btn-line" href={api.steamStartUrl({ link: true, next: "/welcome" })}>
                Link Steam
              </a>
            </>
          )}
        </section>
      ) : null}

      {state?.needsConsent ? (
        <section aria-labelledby="consent-h">
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

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-fill"
        disabled={busy || (!!state?.needsConsent && !agree)}
        onClick={() => void done()}
      >
        {busy ? "Starting…" : "Start"}
      </button>
      {!state?.needsConsent ? (
        <Link className="btn" href="/">
          Skip
        </Link>
      ) : null}
    </main>
  );
}
