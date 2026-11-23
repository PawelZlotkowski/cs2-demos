import Link from "next/link";

/** Shared "nothing here" page body: says what is missing and links back to the library. */
export function NotFound({ title, detail }: { title: string; detail: string }) {
  return (
    <main id="content" className="main state-page"><section className="sheet state-sheet">
      <h1>{title}</h1>
      <p className="lede">{detail}</p>
      <Link className="btn btn-fill" href="/matches">View matches</Link>
    </section>
    </main>
  );
}

export const isNotFound = (message: string | null | undefined) => Boolean(message && /not found/i.test(message));
