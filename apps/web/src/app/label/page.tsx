import Link from "next/link";
import { LabelHeader } from "@/components/labeler/LabelHeader";
import { mapName } from "@/lib/labeler/manifest";
import { pageRpc } from "@/lib/labeler/server/pages";

export const metadata = { title: "Your clips" };

interface Home {
  account: { id: string; displayName: string; role: "admin" | "reviewer" };
  resume: { collectionId: string; clipId: string } | null;
  collections: Array<{
    id: string;
    name: string;
    total: number;
    complete: number;
    draft: number;
    skipped: number;
    maps: string[];
    players: string[];
    nextClipId: string | null;
  }>;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function ReviewerHome() {
  const home = await pageRpc<Home>("labeler_reviewer_home");
  const firstOpen = home.collections.find((c) => c.nextClipId);
  const target = home.resume ?? (firstOpen ? { collectionId: firstOpen.id, clipId: firstOpen.nextClipId! } : null);
  const total = home.collections.reduce((sum, c) => sum + c.total, 0);
  const done = home.collections.reduce((sum, c) => sum + c.complete, 0);

  return (
    <>
      <LabelHeader name={home.account.displayName} role={home.account.role} home={home.account.role === "admin" ? "/label/admin" : "/label"} />
      <main className="lb-main" id="content">
        <section className="lb-hero sheet" aria-labelledby="home-title">
          <h1 id="home-title">Hello, {home.account.displayName}</h1>
          {home.collections.length === 0 ? (
            <p className="lb-lead">Nothing is assigned to you yet. You will be told when clips are ready to review.</p>
          ) : (
            <>
              <p className="lb-lead">
                You have reviewed {done} of {plural(total, "clip")}. Watch the selected player, then write what went well or could be improved.
              </p>
              {target ? (
                <Link className="lb-btn lb-btn-primary lb-btn-large" href={`/label/review/${target.collectionId}/${target.clipId}`}>
                  Continue reviewing
                </Link>
              ) : (
                <p className="lb-notice lb-notice-good" role="status">
                  Every assigned clip has a saved note. Thank you.
                </p>
              )}
            </>
          )}
        </section>

        {home.collections.length ? (
          <section className="lb-section" aria-labelledby="collections-title">
            <h2 id="collections-title">Your collections</h2>
            <ul className="lb-cards">
              {home.collections.map((collection) => {
                const left = collection.total - collection.complete;
                return (
                  <li key={collection.id} className="lb-card sheet">
                    <div className="lb-card-head">
                      <h3>{collection.name}</h3>
                      <p className="lb-meta">
                        {collection.maps.map(mapName).join(" and ")}
                        {collection.players.length ? `, ${collection.players.join(", ")}` : ""}
                      </p>
                    </div>
                    <div className="lb-progress" role="img" aria-label={`${collection.complete} of ${collection.total} reviewed`}>
                      <span style={{ width: `${collection.total ? (collection.complete / collection.total) * 100 : 0}%` }} />
                    </div>
                    <p className="lb-meta">
                      {collection.complete} of {plural(collection.total, "clip")} reviewed
                      {collection.draft ? `, ${plural(collection.draft, "draft")}` : ""}
                      {collection.skipped ? `, ${collection.skipped} skipped` : ""}
                    </p>
                    {collection.nextClipId ? (
                      <Link className="lb-btn lb-btn-secondary" href={`/label/review/${collection.id}/${collection.nextClipId}`}>
                        {collection.complete || collection.draft ? `Resume, ${plural(left, "clip")} left` : "Start this collection"}
                      </Link>
                    ) : (
                      <p className="lb-meta">Finished</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
