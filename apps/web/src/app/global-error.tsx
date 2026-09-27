"use client";

/** The root layout itself failed, so this draws its own page without the app's styles. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 560 }}>
        <h1 style={{ fontSize: 20 }}>Round Reviewer stopped working</h1>
        <p>Something went wrong before the page could load. Your matches and reviews are safe.</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}
