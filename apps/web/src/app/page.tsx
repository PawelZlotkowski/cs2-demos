import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main">
      <h1>Review a match on Radar</h1>
      <p className="lede">
        Upload a FACEIT <code>.dem.zst</code> or a CS Demo Manager <code>.dem</code>. Parsing
        produces round replays you can scrub on one shared playback clock.
      </p>
      <p>
        <Link className="btn btn-fill" href="/upload">
          Add demo
        </Link>
      </p>
      <p className="meta" style={{ marginTop: 24 }}>
        After parsing you choose one player; the app then finds their mistakes and good plays and
        picks the moments worth reviewing. Radar replays cover Mirage and Anubis.
      </p>
    </main>
  );
}
