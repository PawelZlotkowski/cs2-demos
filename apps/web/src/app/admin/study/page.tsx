"use client";

import Link from "next/link";
import { LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";

/** Admin, Study (doc 30 AD14): participants, consent and a pseudonymous export for the report. */
export default function AdminStudy() {
  const { data, error } = useLoad(() => api.admin.study());

  return (
    <main className="main wide" id="content">
      <PageHead
        title="Study"
        lede="Who took part, how much they used the coach and what they thought of it. The export uses a code per person, never names or SteamIDs."
      >
        <a className="btn btn-line" href={api.admin.studyExportUrl()} download>
          Export CSV
        </a>
      </PageHead>
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <p className="meta">
            Study mode is {data.studyMode ? "on: new accounts see the consent step first" : "off"}.{" "}
            <Link href="/admin/settings#accounts">Change it in Settings</Link>.
          </p>
          {data.participants.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Consent</th>
                    <th className="n">Matches</th>
                    <th className="n">Reviewed</th>
                    <th className="n">Questions</th>
                    <th className="n">Feedback</th>
                    <th className="n">Useful</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p) => (
                    <tr key={p.userId}>
                      <td className="mono">{p.participant}</td>
                      <td>{p.name}</td>
                      <td>{p.consented ? "Given" : "–"}</td>
                      <td className="n num">{p.matches}</td>
                      <td className="n num">{p.reviewed}</td>
                      <td className="n num">{p.asks}</td>
                      <td className="n num">{p.feedback}</td>
                      <td className="n num">{p.feedback ? `${Math.round((100 * p.useful) / p.feedback)}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="meta">No participants yet. Make invite codes under Invites.</p>
          )}
        </>
      ) : null}
    </main>
  );
}
