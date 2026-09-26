import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main">
      <h1>Review a match on Radar</h1>
      <p className="lede">
        Upload a FACEIT <code>.dem.zst</code> or a CS Demo Manager <code>.dem</code>. Parsing
        produces round replays you can scrub on a shared playback clock.
      </p>
      <p>
        <Link className="btn btn-fill" href="/upload">
          Add demo
        </Link>
      </p>
      <p className="meta" style={{ marginTop: 24 }}>
        After parsing you choose a player. The coach then finds that player's mistakes and good
        plays and picks five or six moments to review. The fixture sample match has no Radar
        positions, so use a real upload.
      </p>
    </main>
  );
}
