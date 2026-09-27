"use client";

import Link from "next/link";
import { useEffect } from "react";

/** A page threw while rendering (doc 30 AD00): say so plainly and offer a way on. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="main narrow" id="content">
      <h1>This page stopped working</h1>
      <p className="meta">Something went wrong while showing it. Your matches and reviews are safe.</p>
      {error.message ? <pre className="out">{error.message}</pre> : null}
      <p className="row-actions">
        <button type="button" className="btn btn-fill" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/">Go home</Link>
      </p>
    </main>
  );
}
