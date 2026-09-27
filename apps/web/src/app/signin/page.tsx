"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { errorText } from "@/lib/format";

type Mode = "signin" | "create" | "reset";

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/signin") ? v : "/";
}

function SignIn() {
  const params = useSearchParams();
  const { state, refresh } = useAuth();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("reset") ? "reset" : params.get("invite") ? "create" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState(params.get("invite") ?? "");
  const [code, setCode] = useState(params.get("reset") ?? "");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);

  const setup = !!state?.needsSetup;
  useEffect(() => {
    if (setup) setMode("create");
  }, [setup]);

  // Already signed in when the page opened: go on. After a submit, submit() decides where.
  const submitted = useRef(false);
  useEffect(() => {
    if (state?.user && state.authEnabled && !submitted.current) window.location.replace(next);
  }, [state, next]);

  if (state && !state.authEnabled) {
    return (
      <main className="main narrow" id="content">
        <h1>No sign-in needed</h1>
        <p className="meta">Accounts are off, so this PC uses the app as one person, who is also the admin.</p>
        <Link className="btn btn-fill" href="/">
          Go home
        </Link>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await api.login(username, password);
      else if (mode === "create")
        await api.register({ username, password, displayName: displayName || undefined, inviteCode: invite || undefined });
      else await api.resetPassword(code, password);
      submitted.current = true;
      const s = await refresh();
      window.location.replace(mode === "create" ? "/welcome" : s?.needsConsent ? "/welcome" : next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const needsInvite = mode === "create" && !setup && state?.signup === "invite";
  const closed = mode === "create" && !setup && state?.signup === "closed";

  return (
    <main className="main narrow signin" id="content">
      <h1>{setup ? "Create the admin account" : mode === "create" ? "Create an account" : mode === "reset" ? "Set a new password" : "Sign in"}</h1>
      {setup ? (
        <p className="meta">
          This is the first account on this PC, so it becomes the admin and takes over the matches already here.
        </p>
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {mode !== "reset" && !closed ? (
        <>
          <a className="btn btn-fill steam" href={api.steamStartUrl({ next, invite: invite || undefined })}>
            {mode === "create" ? "Create an account with Steam" : "Sign in with Steam"}
          </a>
          <p className="or">
            <span>or with a username</span>
          </p>
        </>
      ) : null}

      {closed ? (
        <p className="empty">Sign-up is closed. Ask the admin for an account.</p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          {mode === "reset" ? (
            <label>
              Reset code
              <input className="input" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            </label>
          ) : (
            <label>
              Username
              <input
                className="input"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                pattern="[A-Za-z0-9_.\-]{3,32}"
                title="3 to 32 letters, digits, dots, dashes or underscores"
              />
            </label>
          )}
          {mode === "create" ? (
            <label>
              <span>
                Name shown in the app <span className="meta">(optional)</span>
              </span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
            </label>
          ) : null}
          <label>
            {mode === "signin" ? "Password" : "New password"}
            <input
              className="input"
              type="password"
              required
              minLength={mode === "signin" ? 1 : 10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            {mode !== "signin" ? <span className="meta">At least 10 characters.</span> : null}
          </label>
          {needsInvite ? (
            <label>
              Invite code
              <input className="input" required value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="ABCD-1234-EF56" />
            </label>
          ) : null}
          <button type="submit" className="btn btn-fill" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "create" ? "Create account" : "Set password"}
          </button>
        </form>
      )}

      {!setup ? (
        <p className="auth-switch">
          {mode !== "signin" ? (
            <button type="button" className="link" onClick={() => setMode("signin")}>
              I have an account
            </button>
          ) : null}
          {mode !== "create" && state?.signup !== "closed" ? (
            <button type="button" className="link" onClick={() => setMode("create")}>
              Create an account
            </button>
          ) : null}
          {mode !== "reset" ? (
            <button type="button" className="link" onClick={() => setMode("reset")}>
              I have a reset code
            </button>
          ) : null}
        </p>
      ) : null}
    </main>
  );
}

/** Sign in, create an account (first one is admin, then with an invite), or use a reset code (A05). */
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="main narrow" id="content" />}>
      <SignIn />
    </Suspense>
  );
}
