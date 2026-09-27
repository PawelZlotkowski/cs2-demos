import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main" id="content">
      <h1>Review your match with a coach</h1>
      <p className="lede">
        Upload a FACEIT <code>.dem.zst</code> or a CS Demo Manager <code>.dem</code> and choose whose game to
        review. The coach picks five or six moments, good and bad, and explains each one with the radar and a clip
        from that player&apos;s view.
      </p>
      <p>
        <Link className="btn btn-fill" href="/upload">
          Add match
        </Link>
      </p>
      <p className="meta" style={{ marginTop: 24 }}>
        Mirage and Anubis only for now. Everything runs on this computer, including the coach model.
      </p>
    </main>
  );
}
