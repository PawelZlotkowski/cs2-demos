"use client";

import { useEffect, useState } from "react";
import { LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { RuntimeSetting } from "@/lib/contracts";
import { errorText } from "@/lib/format";

function slug(group: string): string {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function SettingRow({ s, onSaved }: { s: RuntimeSetting; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState(s.value == null ? "" : String(s.value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(s.value == null ? "" : String(s.value)), [s.value]);

  async function save(value: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api.admin.setSetting(s.key, value);
      onSaved(`${s.label} saved. It applies to the next job.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const id = `set-${s.key}`;
  const changed = draft !== (s.value == null ? "" : String(s.value));
  return (
    <li className="setting">
      <label htmlFor={id} className="setting-l">
        {s.label}
        <span className="mono">{s.env}</span>
      </label>
      <span className="setting-v">
        {s.kind === "bool" ? (
          <input id={id} type="checkbox" checked={Boolean(s.value)} disabled={busy} onChange={(e) => void save(e.target.checked)} />
        ) : s.choices ? (
          <select id={id} className="input small" value={String(s.value ?? "")} disabled={busy} onChange={(e) => void save(e.target.value)}>
            {s.choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <form
            className="setting-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(s.kind === "number" ? (draft === "" ? null : Number(draft)) : draft);
            }}
          >
            <input
              id={id}
              className="input small"
              inputMode={s.kind === "number" ? "decimal" : undefined}
              value={draft}
              placeholder={s.value == null ? "not set" : undefined}
              onChange={(e) => setDraft(e.target.value)}
            />
            {changed ? (
              <button type="submit" className="btn btn-line small" disabled={busy}>
                Save
              </button>
            ) : null}
          </form>
        )}
        {s.source === "admin" ? (
          <button
            type="button"
            className="link small"
            title={`The .env value is ${s.envValue == null ? "not set" : String(s.envValue)}`}
            onClick={async () => {
              try {
                await api.admin.resetSetting(s.key);
                onSaved(`${s.label} is back to the .env value.`);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Use .env value
          </button>
        ) : null}
      </span>
      {error ? <span className="err">{error}</span> : null}
    </li>
  );
}

/** Admin, Settings (doc 30 AD07): values that apply without restarting the API; the rest read-only. */
export default function AdminSettings() {
  const { data, error, reload } = useLoad(() => api.admin.settings());
  const [msg, setMsg] = useState<string | null>(null);
  const groups = [...new Set((data?.runtime ?? []).map((s) => s.group))];

  return (
    <main className="main wide" id="content">
      <PageHead
        title="Settings"
        lede="Changes here win over apps/api/.env and apply to the next job without a restart. The settings at the bottom need the .env file and a restart."
      />
      {msg ? (
        <p className="meta" role="status">
          {msg}
        </p>
      ) : null}
      <LoadState error={error} loading={!data} />
      {groups.map((g) => (
        <section key={g} id={slug(g)} className="settings-sec" aria-labelledby={`${slug(g)}-h`}>
          <div className="sec-h">
            <h2 id={`${slug(g)}-h`}>{g}</h2>
          </div>
          <ul className="setting-list">
            {data!.runtime
              .filter((s) => s.group === g)
              .map((s) => (
                <SettingRow
                  key={s.key}
                  s={s}
                  onSaved={(m) => {
                    setMsg(m);
                    void reload();
                  }}
                />
              ))}
          </ul>
        </section>
      ))}
      {data ? (
        <section className="settings-sec" aria-labelledby="restart-h">
          <div className="sec-h">
            <h2 id="restart-h">Needs a restart</h2>
          </div>
          <dl className="facts">
            {data.restart.map((r) => (
              <div key={r.key}>
                <dt className="mono">{r.env}</dt>
                <dd className="mono">{r.value == null ? "not set" : Array.isArray(r.value) ? r.value.join(", ") : String(r.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
