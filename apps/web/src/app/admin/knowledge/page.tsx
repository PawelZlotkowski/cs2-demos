"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmButton, LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { ago, errorText } from "@/lib/format";

/** Admin, Knowledge (doc 30 AD10): own map notes, players' flags, the index. */
export default function AdminKnowledge() {
  const { data, error, reload } = useLoad(() => api.admin.knowledge());
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  return (
    <main className="main wide" id="content">
      <PageHead title="Knowledge" lede={data ? `${data.passages} passages the coach can cite. Add notes from the Coach page, Knowledge tab.` : undefined}>
        <button type="button" className="btn btn-line" onClick={() => void act(async () => {
          const r = await api.admin.rebuildKnowledge();
          setMsg(`Index rebuilt: ${r.passages} passages.`);
        }, "Index rebuilt.")}>
          Rebuild the index
        </button>
      </PageHead>
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <section className="settings-sec" aria-labelledby="flags-h">
            <div className="sec-h">
              <h2 id="flags-h">Flagged as wrong</h2>
            </div>
            {data.flags.length ? (
              <ul className="plain-list">
                {data.flags.map((f) => (
                  <li key={f.id}>
                    <b className="mono">{f.passageId}</b> {f.title ? <span>{f.title}</span> : null}
                    <p className="meta">
                      &ldquo;{f.note || "No note"}&rdquo; · {ago(f.createdAt)}
                    </p>
                    <button type="button" className="link small" onClick={() => void act(() => api.admin.resolveFlag(f.id), "Flag resolved.")}>
                      Resolve
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No flags.</p>
            )}
          </section>
          <section className="settings-sec" aria-labelledby="notes-h">
            <div className="sec-h">
              <h2 id="notes-h">Own notes</h2>
              <Link className="link small" href="/coach#knowledge">
                Add a note
              </Link>
            </div>
            <p className="meta">Editing keeps a note&rsquo;s citation id. Deleting one gives the notes after it on that map new ids.</p>
            {data.notes.length ? (
              <ul className="plain-list">
                {data.notes.map((n) => {
                  const key = `${n.map}/${n.index}`;
                  return (
                    <li key={key}>
                      {editing === key ? (
                        <form
                          className="page-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act(async () => {
                              await api.admin.editNote(n.map, n.index, title, text);
                              setEditing(null);
                            }, "Note saved.");
                          }}
                        >
                          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
                          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Text" />
                          <span className="row-actions">
                            <button type="submit" className="btn btn-fill small">
                              Save
                            </button>
                            <button type="button" className="link small" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </span>
                        </form>
                      ) : (
                        <>
                          <b>{n.title}</b> <span className="meta">{n.map.replace("de_", "")}</span>
                          <p className="meta clamp">{n.text}</p>
                          <span className="row-actions">
                            <button
                              type="button"
                              className="link small"
                              onClick={() => {
                                setEditing(key);
                                setTitle(n.title);
                                setText(n.text);
                              }}
                            >
                              Edit
                            </button>
                            <ConfirmButton label="Delete" question={`Delete "${n.title}"?`} onConfirm={() => act(() => api.admin.deleteNote(n.map, n.index), "Note deleted.")} />
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="meta">No own notes yet.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
