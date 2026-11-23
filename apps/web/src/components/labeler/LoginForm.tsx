"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { clearDrafts } from "./drafts";

export function LoginForm({ ended }: { ended: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Paste your access code first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ account: { id: string }; redirect: string }>("/auth/login", { body: { code } });
      // Another person's unsent drafts on this browser are removed when someone else signs in.
      clearDrafts(result.account.id);
      setCode("");
      router.replace(result.redirect);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="lb-login-form" onSubmit={submit} noValidate>
      {ended && !error ? (
        <p className="lb-notice" role="status">
          Your session ended. Sign in again with your current access code.
        </p>
      ) : null}
      <div className="lb-field">
        <label className="lb-label" htmlFor="access-code">
          Access code
        </label>
        <input
          id="access-code"
          className="lb-input lb-code-input"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        />
      </div>
      {error ? (
        <p className="lb-error" id="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="lb-btn lb-btn-primary lb-btn-wide" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
