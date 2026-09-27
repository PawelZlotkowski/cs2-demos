# 30 Full review, roles and the admin panel

**Date:** 27 September 2026 · **Status:** plan, nothing built · **Reviewed:** PR #22's branch (`claude/feature-roadmap-26ezhz`, development plus doc 29 R00–R18)

Pawel asked for a full review of what is still missing (pages, users, security, roles) and for a **separate admin panel where he can control everything**. This doc lists the gaps, ranks the security findings with file references, defines roles, and plans the admin panel as tasks `AD00`–`AD16` that slot into the accounts plan ([27](./27-ACCOUNTS-PLAN.md), `A00`–`A14`).

Decisions this doc respects: sign-in is Steam plus a local username and password in FastAPI (22); the app runs on Pawel's private PC only (23); manual upload only (24); the Lab is built in the app and admin-only (25); fully self-hosted models (16).

---

## 1. Summary

- **The product pages are there; the people layer is not.** Home, Upload, Processing, Studio, Matches, Progress, Coach, Lab and Settings (System) all work against the real API. There is no sign-in, no user, no owner on a match, no role, and no way to delete anything.
- **Admin control is scattered.** It lives today in `apps/api/.env` (read once at start-up), one `RR_LAB_ENABLED` switch, the Lab page, and the Settings System check. None of it can be changed from the app, and nothing records who did what.
- **The biggest security issue is not auth, it is exposure.** `compose.yaml` publishes the API on every network interface with no auth at all, so anyone on the same Wi-Fi can upload, read every match and clip, and write labels (S1). That contradicts decision 23 and is a one-line fix.
- **Recommended shape:** one Next.js app with a separate `/admin` area (own layout, own nav, own light chrome, server-side role check), backed by FastAPI `/admin/*` routes behind a `require_admin` dependency. The Lab moves inside it. Section 5 gives the panel, section 7 the task order.

---

## 2. What exists today

| Page | Route | State | Missing for a finished product |
|---|---|---|---|
| Home | `/` | Works | Signed-in greeting, "continue where you left off" (A09) |
| Upload | `/upload` | Works | Upload limit per user (A13), queue position |
| Processing | `/processing/[id]` | Works | — |
| Studio | `/studio/[matchId]` | Works (Analysis, Ask, Round, Notes) | Feedback "Useful / Not right" (A10), past Ask threads (A09), view an earlier review version |
| Matches | `/matches` | Lists **every** match on the PC | Only own matches (A08), delete, rename, row menu |
| Progress | `/progress` | Works for one coached player | Scoped to the signed-in user (A11) |
| Coach | `/coach` | Ask, Plan, Knowledge | Player comes from the account, not a picker; Knowledge "flag" is open to anyone |
| Lab | `/lab` | Runs, Labels, Evaluation, Dataset | Study tab (needs A13); moves into the admin panel |
| Settings | `/settings` | System check, Connect another app | Profile, coach language, playback, data export/delete, sessions (A07, A12) |
| 404 | `not-found.tsx` | Works | — |

### Pages that do not exist yet

| Page | Why it is needed | Task |
|---|---|---|
| Sign in / Create account (with invite code) | No users exist | A05 |
| Welcome step (link Steam, pick language) | First run after sign-in | A05, A07 |
| Account menu in the top bar | Sign out, Settings, Admin link for admins | A05 |
| **Admin panel** `/admin/*` | Pawel's control centre (section 5) | AD01+ |
| Error page `app/error.tsx` and `global-error.tsx` | A thrown render error shows Next's default screen today | AD00 |
| Review versions view | Re-runs keep the old review (`/matches/{id}/versions`) but nothing shows it | AD09 |
| Consent page (study mode) | Needed before participants use it (A13) | A13 |
| Shared review `/r/[token]` | Optional (A14) | A14 |

---

## 3. Users and roles

### 3.1 Roles

Doc 27 has two roles (`admin`, `player`). The Lab already has a second person in it: the pair partner labels rounds and rates A/B pairs. Give that its own role so the partner can label without being able to delete users or change the model.

| Role | Who | Can |
|---|---|---|
| `admin` | Pawel (the first account is admin) | Everything in the admin panel, including users, settings, deletes |
| `labeller` | Pair partner, study helpers | Lab only: Runs (read), Labels, Evaluation votes, Dataset review. Sees every match, read-only, because labelling needs them |
| `player` | Everyone else, study participants | Own matches, own Coach, Progress, Settings |

Roles are a single column (`users.role`). No custom permission editor: three fixed roles are enough for a prototype and easy to test.

### 3.2 Permission matrix

| Action | player | labeller | admin |
|---|---|---|---|
| Upload, review, Ask, bookmark own matches | ✓ | ✓ | ✓ |
| Read another user's match | – | read-only | ✓ |
| Delete own match / account | ✓ | ✓ | ✓ |
| Lab: Runs, Labels, Evaluation, Dataset | – | ✓ | ✓ |
| Lab: Dataset export, Study export | – | – | ✓ |
| Knowledge: add note | – | – | ✓ |
| Knowledge: flag passage | ✓ | ✓ | ✓ (and resolve flags) |
| Re-run a review | own | – | any |
| Users, invites, roles, sessions | – | – | ✓ |
| Runtime settings, feature switches, model | – | – | ✓ |
| Jobs: retry, cancel | own | – | any |
| Storage cleanup, backups, audit log | – | – | ✓ |

### 3.3 Before accounts exist

`RR_AUTH_ENABLED=false` stays the default so tests and the current setup keep working (doc 27). With auth off, the admin panel behaves like today's Lab: it is on only when `RR_ADMIN_ENABLED=true` and only answers requests from `127.0.0.1`. With auth on, the switch is ignored and the role decides.

---

## 4. Security review

Ranked by what could actually go wrong on Pawel's PC. File references are on PR #22's branch.

| # | Severity | Finding | Where | Fix |
|---|---|---|---|---|
| S1 | **High** | The API and web ports are published on all interfaces (`"8000:8000"`, `"3000:3000"`), and the CS:DM Postgres on `5432` with password `postgres`. With no auth, anyone on the same network can upload, read every match and clip, write labels and knowledge flags, and call the coach (GPU time). Contradicts decision 23 | `compose.yaml` | Bind to loopback: `"127.0.0.1:8000:8000"`, `"127.0.0.1:3000:3000"`, `"127.0.0.1:5432:5432"`. Same for `uvicorn --host` in `docs/RUN-LOCALLY.md` (already 127.0.0.1 by default) |
| S2 | High (once accounts exist) | No owner on matches; every `/matches/{id}` route, clip MP4 and coach tool reads any match | `api/routes.py`, `api/roadmap.py`, `coach/tools.py` | A03, A04 as planned. The route-walking ownership test in doc 27 §12 must include `/matches/{id}/bookmarks`, `/versions`, `/rerun` and the `/players/*` routes added in #22 |
| S3 | Medium | Upload reads the whole file into memory before the size check (`await file.read()`, up to 300 MB per request, no limit on parallel uploads) | `api/routes.py:79` | Stream to a temp file in chunks, stop at `max_upload_bytes`, check the zstd/demo magic bytes before accepting |
| S4 | Medium | Ask and Ask-across start an LLM run per request with no queue or limit; a few tabs or a script can pin the GPU and slow every review | `api/routes.py:406`, `:421` | One GPU queue (doc 27 §4) with a per-user limit of 1 running Ask; admin sees and cancels it (AD06) |
| S5 | Medium | Lab gating is a single env switch; when it is on, every Lab route is open to anyone who can reach the API, including dataset export and knowledge notes that write into the repo's `data/` | `api/lab.py:42`, `api/roadmap.py` | Replace `_require_lab()` with `require_role("labeller")` / `require_admin` (AD02) |
| S6 | Medium | `POST /knowledge/{id}/flag` is not gated at all; anyone can write flags | `api/roadmap.py:213` | Needs a signed-in user; admin resolves flags in the panel (AD10) |
| S7 | Low | Round clips are served with `Cache-Control: public, max-age=3600` | `api/routes.py:141` | `private` once clips belong to a user |
| S8 | Low | `/docs` and `/openapi.json` are always on | `main.py` | Off when auth is on unless `RR_API_DOCS=true` |
| S9 | Low | Two MCP tools write (`select_moments`, `request_clip`) and the HTTP transport has no token | `apps/mcp`, doc 29 §9 row 4.2 | Per-app tokens created in the admin panel (AD12); the HTTP server keeps 127.0.0.1 |
| S10 | Low | Legacy stubs still routed: `/users/me/patterns` and `/users/{id}/patterns` return the sample match for any id; `/matches/{id}/coach` is the mocked coach | `api/routes.py:487–526` | Delete the legacy routes (AGENTS.md: the main path must not depend on the mock) |
| S11 | Low | No way to delete a match or its files; player data stays on disk forever | repositories | A12 for users; AD05 for admins |
| S12 | Info | CORS allows credentials from localhost:3000 only, which is right. After A00 (same-origin `/api` rewrite) CORS can be removed | `main.py` | A00 |

Things checked and fine: match ids are server-made UUIDs and every file path is built from a known record, so path traversal through `match_id` or `clip_id` is not possible; `KnowledgeNoteRequest.map` is a `Literal`, so notes cannot write outside `notes/`; the MCP HTTP server defaults to 127.0.0.1; React escapes the stored upload filename.

What the auth PR itself must get right is already in doc 27 §12 (Steam callback forgery, hashed session tokens, expired sessions). Add: CSRF protection on cookie-authenticated `POST/PUT/DELETE` (SameSite=Lax cookie plus an `Origin` check), login rate limit (the `login_attempts` table), and Argon2id parameters recorded in the doc.

---

## 5. The admin panel

### 5.1 Shape

- **Where:** `/admin` in the same Next.js app, in its own route group `app/(admin)/admin/` with its own `layout.tsx`: a left sidebar instead of the top bar, the Tactical Desk light chrome (doc 28 tokens, hairlines, radii 2 and 4 px, condensed numerals for data only), and a "Back to app" link. It never shows the dark stage.
- **Why not a separate app or port:** one build, one sign-in, one design system; a second app would double the auth work for a single-PC install. The API keeps the boundary: every admin call goes to `/admin/*` routes behind `require_admin`, so hiding the link is not the protection.
- **Entry:** "Admin" in the account menu for admins only. `/lab` redirects to `/admin/lab`.
- **Changes that matter** (delete, role change, setting change) ask for confirmation with the object named ("Delete match mirage 13–9 and its 6 clips?") and are written to the audit log.

### 5.2 Sections

| Section | What Pawel sees | What Pawel can do | API |
|---|---|---|---|
| **Overview** | Services up/down (API, llama-server model, embeddings, CS:DM, Steam, csdm-postgres), jobs running and queued, disk used, users, matches this week, last errors | Jump to any problem | `GET /admin/overview` (extends `/system`) |
| **Users** | Table: name, Steam or local, role, matches, storage, last seen, study status | Change role, disable, sign out everywhere, reset password (one-time link), delete with data | `GET/PATCH/DELETE /admin/users/{id}` |
| **Invites** | Codes, who made them, used by, expiry | Create (single or batch for the study), revoke | `GET/POST/DELETE /admin/invites` |
| **Matches** | Every match: owner, map, score, status, coached player, model, size on disk, created | Open in Studio, re-run with the current model, change owner, delete (files, clips, analysis, traces) | `GET /admin/matches`, `DELETE /admin/matches/{id}`, `PATCH` owner |
| **Jobs** | Pipeline stages, clip recordings, coach jobs and Ask runs, each with state, time, error | Retry, cancel, clear failed | `GET /admin/jobs`, `POST .../retry`, `.../cancel` |
| **Model and services** | Served model, sampling profile, context, verifier pass rate from recent traces, tokens per second | Change settings that do not need a restart (below); a copyable `llama-server` command for a model switch | `GET/PUT /admin/settings` |
| **Settings and switches** | Every `RR_*` value with its source (default, `.env`, admin override) | Edit runtime-safe values: `coach_max_steps`, sampling overrides, CS:DM pads and size, upload limits, per-user match limit, study mode, sign-up open/invite-only, Lab on/off. Values that need a restart are shown read-only with a note | stored in a `settings` table that overrides `.env` |
| **Knowledge** | Passages by map and zone, flags from players, index state | Add, edit, delete own notes; resolve flags; rebuild index | moves `POST /knowledge/notes` under `/admin` |
| **Lab** | Today's Runs, Labels, Evaluation, Dataset, plus Study | Unchanged, now role-gated (labeller or admin) | `/admin/lab/*` (old `/lab/*` kept as alias for one release) |
| **Study** | Participants, consent, matches reviewed, feedback counts | Export pseudonymous CSV (feedback, Ask logs, ratings) | `GET /admin/study-export` |
| **Storage** | Disk by folder: uploads, work, matches, clips, traces, dataset | Delete decompressed `.dem` work files, old clips, traces older than N days | `GET /admin/storage`, `POST /admin/storage/cleanup` |
| **Security** | Active sessions, failed logins, API tokens for MCP clients | Revoke sessions, create/revoke tokens (read-only or read-write) | `/admin/sessions`, `/admin/tokens` |
| **Audit log** | Who did what, when: sign-ins, role changes, deletes, setting changes, exports | Filter, export | `GET /admin/audit` |
| **Backup** | Last backup, size | Download a zip of the SQLite database, labels and knowledge notes (not raw demos); restore on a fresh install | `POST /admin/backup` |

### 5.3 Data added on top of doc 27 §10

```
settings(key PRIMARY KEY, value_json, updated_by, updated_at)     -- runtime overrides of RR_*
audit_log(id, at, actor_id, action, target, detail_json, ip)
api_tokens(token_hash PRIMARY KEY, name, scope 'read'|'write', created_by, created_at, last_used_at, revoked_at NULL)
jobs(id, kind, match_id, player_id NULL, user_id NULL, state, started_at, ended_at, error NULL)  -- one view over pipeline, clips, coach, ask
users.disabled_at NULL
users.role CHECK(role IN ('admin','labeller','player'))
```

`jobs` can start as a read model built from the existing pipeline status, clip jobs and traces, and become the GPU queue in AD06.

---

## 6. Other gaps found in the review

- **No delete anywhere.** Not for matches, clips, bookmarks older than a re-run, traces, or knowledge notes. Needed for users (A12) and for the admin (AD05, AD11).
- **Review versions are stored but unseen.** Re-run saves the old review; neither Matches nor the Studio can open it (doc 29 §9, row 2.4).
- **Feedback is not built** (A10), so the evaluation has no user signal yet.
- **Legacy mock routes** are still live (S10).
- **No app-level error page** (`app/error.tsx`).
- **Settings apply only after a restart** (`.env` read at start-up); the admin panel's settings table fixes that for runtime-safe values.
- **No GPU queue** (S4), so a re-run, a moment selection and two Ask requests can hit llama-server at once.

---

## 7. Tasks

Sizes: S under half a day, M one to two days. `A` tasks are doc 27's; they stay where they are and the `AD` tasks slot in after them.

| ID | Task | Depends on | Done when | Size |
|---|---|---|---|---|
| AD00 | Bind Docker ports to 127.0.0.1 (S1); `app/error.tsx` and `global-error.tsx`; remove legacy mock routes (S10) | – | `docker compose up` not reachable from another device; tests green | S |
| AD01 | `(admin)` route group, sidebar layout, Overview from `/system` + counts; `RR_ADMIN_ENABLED` + loopback check while auth is off | – | `/admin` renders on the PC, 404 elsewhere | M |
| AD02 | `require_admin` / `require_role` dependencies; move Lab routes to `/admin/lab/*` behind `labeller`; `/lab` redirects | AD01 (A01 for roles) | route test: player 403, labeller Lab only, admin all | S |
| AD03 | Streamed upload with magic-byte check and size stop (S3) | – | 400 MB upload rejected without RAM spike; bad magic rejected | S |
| AD04 | Users and Invites sections, role change, disable, sign out everywhere | A01, A13 | a participant signs up with a code; admin disables them; their session ends | M |
| AD05 | Matches section with owner, size, delete (files, clips, analysis rows, traces) and change owner | A03 | delete test: folders and rows gone | M |
| AD06 | `jobs` view and one GPU queue (per-user limit 1 Ask); Jobs section with retry and cancel (S4) | – | two Ask requests run one after the other; cancel stops a queued one | M |
| AD07 | `settings` table overriding `.env`; Settings and switches section; restart-only values read-only | AD01 | changing `coach_max_steps` applies to the next job without a restart | M |
| AD08 | Model and services: served model, verifier pass rate, tokens per second from traces (closes doc 29 §9 row 2.2 Runs) | AD01 | page matches `/system` and the last 50 traces | S |
| AD09 | Review versions viewer (admin and owner) | AD05 | an earlier review opens read-only in the Studio | S |
| AD10 | Knowledge section: edit/delete own notes, resolve flags, rebuild index; gate flags behind sign-in (S6) | AD02 | flag resolved disappears from the list | S |
| AD11 | Storage section with cleanup | AD05 | cleanup removes work `.dem` files and reports freed space | S |
| AD12 | API tokens for MCP clients (read / write scope), Security section with sessions and failed logins (S9) | A01 | MCP HTTP call without a token is refused when auth is on | M |
| AD13 | Audit log written by every admin route and sign-in | AD02 | each admin action in the route test adds one row | S |
| AD14 | Study section and CSV export (moves A13's export here) | A10, A13 | CSV has user ids, no names or SteamIDs | S |
| AD15 | Backup and restore (SQLite, labels, notes) | AD13 | restore on an empty data dir brings back users and reviews | S |
| AD16 | Security pass: CSRF/Origin check, `Cache-Control: private` on clips, `/docs` off with auth (S7, S8), `security-review` run | A01 | checklist in doc 27 §12 plus this section passes | S |

### Suggested order

1. **Now, no accounts needed:** AD00, AD03, AD01, AD06, AD07, AD08. These make the PC install safer and give Pawel a working admin panel over everything that exists today.
2. **With accounts:** A00 → A01 → AD02 → A02, A03 → AD04, AD05, AD13 → A05–A12 as in doc 27.
3. **Before the user study (17 Nov defence at the latest):** A13, AD12, AD14, AD16.
4. **If time allows:** AD09, AD10, AD11, AD15, A14.

---

## 8. Open questions for Pawel

1. **Admin panel inside the app at `/admin` (recommended) or a separate app on its own port?** The plan assumes `/admin`.
2. **A third role, `labeller`, for the pair partner?** Recommended, so the partner can label without admin rights.
3. **Start with step 1 of the order (no accounts yet), or accounts first?** Recommended: step 1 first, because AD00 closes the open ports today.
