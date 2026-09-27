"use client";

import { useEffect, useState } from "react";
import { ConfirmButton, useLoad } from "@/components/admin/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { COACH_LANGUAGES, useCoachLanguage } from "@/lib/coach/language";
import { ago, errorText } from "@/lib/format";
import { pushSettings, readStartRate } from "@/lib/prefs";
import type { PlaybackRate } from "@/lib/replay/usePlaybackClock";

const RATES: PlaybackRate[] = [0.5, 1, 2, 4];

/** Settings, Coach: answer language and the Studio's starting speed, saved on the account (A07). */
export function CoachPrefs() {
  const [lang, setLang] = useCoachLanguage();
  const [rate, setRate] = useState<PlaybackRate>(1);
  useEffect(() => setRate(readStartRate()), []);

  return (
    <section id="coach" className="settings-sec" aria-labelledby="coach-h">
      <div className="sec-h">
        <h2 id="coach-h">Coach and playback</h2>
      </div>
      <ul className="setting-list">
        <li className="setting">
          <span className="setting-l" id="lang-l">
            Coach language
            <span className="meta">Explanations and Ask answers. The app itself stays in English.</span>
          </span>
          <span className="setting-v">
            <span className="seg seg-plain" role="group" aria-labelledby="lang-l">
              {COACH_LANGUAGES.map((l) => (
                <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </span>
          </span>
        </li>
        <li className="setting">
          <span className="setting-l" id="rate-l">
            Starting speed
            <span className="meta">How fast the Studio plays when a match opens.</span>
          </span>
          <span className="setting-v">
            <span className="seg seg-plain" role="group" aria-labelledby="rate-l">
              {RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rate === r}
                  onClick={() => {
                    setRate(r);
                    void pushSettings({ playbackSpeed: r });
                  }}
                >
                  <span className="num">{r}×</span>
                </button>
              ))}
            </span>
          </span>
        </li>
      </ul>
    </section>
  );
}

/** Settings, Profile: name, username, password and Steam (A07). Only with accounts on. */
export function Profile() {
  const { user, state, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || !state) return null;

  async function save(e: React.FormEvent, body: Parameters<typeof api.updateMe>[0], done: string) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateMe(body);
      await refresh();
      setCurrent("");
      setNext("");
      setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="profile" className="settings-sec" aria-labelledby="profile-h">
      <div className="sec-h">
        <h2 id="profile-h">Profile</h2>
      </div>
      {msg ? (
        <p className={msg.ok ? "meta" : "err"} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      ) : null}
      <form
        className="inline-form"
        onSubmit={(e) =>
          save(e, { displayName: displayName.trim(), username: username.trim() || undefined }, "Profile saved.")
        }
      >
        <label>
          Name shown in the app
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
        </label>
        <label>
          Username
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[A-Za-z0-9_.\-]{3,32}"
            title="3 to 32 letters, digits, dots, dashes or underscores"
            autoComplete="username"
            required={user.hasPassword}
          />
        </label>
        <button type="submit" className="btn btn-line" disabled={busy}>
          Save
        </button>
      </form>

      <form
        className="inline-form"
        onSubmit={(e) =>
          save(
            e,
            { currentPassword: user.hasPassword ? current : undefined, newPassword: next, username: username.trim() || undefined },
            user.hasPassword ? "Password changed. Other devices are signed out." : "Password set.",
          )
        }
      >
        {user.hasPassword ? (
          <label>
            Current password
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
        ) : null}
        <label>
          {user.hasPassword ? "New password" : "Set a password"}
          <input
            className="input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={10}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className="btn btn-line" disabled={busy}>
          {user.hasPassword ? "Change password" : "Set password"}
        </button>
      </form>

      <ul className="plain-list">
        <li>
          <span>
            Steam{" "}
            {user.steamId ? <span className="mono">{user.steamId}</span> : <span className="meta">not linked</span>}
          </span>
          {user.steamId ? (
            user.hasPassword ? (
              <ConfirmButton
                label="Unlink"
                question="Unlink Steam from this account?"
                onConfirm={async () => {
                  await api.unlinkSteam();
                  await refresh();
                }}
              />
            ) : (
              <span className="meta">Set a password before unlinking, or you could not sign in.</span>
            )
          ) : state.steam ? (
            <a className="link small" href={api.steamStartUrl({ link: true, next: "/settings" })}>
              Link Steam
            </a>
          ) : null}
        </li>
      </ul>
      {user.steamId ? (
        <p className="meta">Matches where you played as this Steam account open with you already picked.</p>
      ) : null}
    </section>
  );
}

/** Settings, Sessions: where this account is signed in, and ending the others (A07). */
export function Sessions() {
  const { data, error, reload } = useLoad(() => api.mySessions());
  return (
    <section id="sessions" className="settings-sec" aria-labelledby="sessions-h">
      <div className="sec-h">
        <h2 id="sessions-h">Signed in</h2>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <ul className="plain-list">
        {(data ?? []).map((s) => (
          <li key={s.id}>
            <span>
              {s.userAgent ? shortAgent(s.userAgent) : "Unknown browser"}
              {s.current ? <span className="tag">This browser</span> : null}
            </span>
            <span className="meta">
              {s.ip ?? "no address"} · active {ago(s.lastSeenAt)}
            </span>
            {s.current ? (
              <span />
            ) : (
              <ConfirmButton
                label="Sign out"
                question="Sign out that browser?"
                onConfirm={async () => {
                  await api.endMySession(s.id);
                  await reload();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function shortAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Settings, Your data: a zip of everything, and deleting the account with it (A12). */
export function YourData() {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const expected = user.username ?? "DELETE";

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe(confirm);
      window.location.assign("/signin");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <section id="data" className="settings-sec" aria-labelledby="data-h">
      <div className="sec-h">
        <h2 id="data-h">Your data</h2>
        <a className="btn btn-line" href={api.exportUrl()} download>
          Download everything
        </a>
      </div>
      <p className="meta">
        The download is a zip with your profile, matches, reviews, Ask history, notes and feedback. Demos and clips stay
        on this PC.
      </p>
      <form className="inline-form" onSubmit={remove}>
        <label>
          <span>
            Delete my account and all my matches. Type <b>{expected}</b> to confirm.
          </span>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-line danger" disabled={busy || confirm !== expected}>
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </form>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
