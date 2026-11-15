"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function AccessPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.openSession(token.trim());
      setToken("");
      router.push("/upload");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Access your reviews</h1>
      <p>Personal mode works on this computer. For a hosted private beta, use your access token.</p>
      <form onSubmit={signIn}>
        <label htmlFor="access-token">Access token</label>
        <input id="access-token" type="password" value={token} autoComplete="off"
          onChange={(event) => setToken(event.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </main>
  );
}
