import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main" id="content">
      <h1>Review your match with a coach</h1>
      <p className="lede">
        Upload a FACEIT <code>.dem.zst</code> or a CS Demo Manager <code>.dem</code> and choose whose game to
        review. Review selected moments with their evidence and radar playback. Local rules flag situations
        worth checking; an optional model explains them, and recorded clips appear when available.
      </p>
      <p>
        <Link className="btn btn-fill" href="/upload">
          Add match
        </Link>
      </p>
      <p className="meta" style={{ marginTop: 24 }}>
        Ancient and Anubis are the current focus. This local version runs on your computer; the model and recording are optional.
      </p>
    </main>
  );
}
