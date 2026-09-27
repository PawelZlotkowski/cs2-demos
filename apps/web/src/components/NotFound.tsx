import Link from "next/link";

/** Shared "nothing here" page body: says what is missing and offers the two ways on. */
export function NotFound({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="main">
      <h1>{title}</h1>
      <p className="lede">{detail}</p>
      <p className="row-actions">
        <Link className="btn btn-fill" href="/upload">
          Add demo
        </Link>
        <Link className="btn btn-line" href="/">
          Home
        </Link>
      </p>
    </main>
  );
}

export const isNotFound = (message: string | null | undefined) => Boolean(message && /not found/i.test(message));
