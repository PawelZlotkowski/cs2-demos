# 27 Accounts, history and user features plan

Date: 27 September 2026. Baseline: branch `claude/coach-pov-clips-klj78o` (draft PR #8). Plan only; no app code changed.

Builds on [26 Design polish plan](./26-DESIGN-POLISH-PLAN.md) (draft PR #9), which already covers the match overview, the review ending, the home table of matches, explanation feedback and the look of every screen. This plan adds what sits underneath those: who the user is, which matches are theirs, what the app remembers about them, and the settings and data controls a user expects. Where 26 already describes a screen, this plan only adds the account side of it.

Related: [01 Product scope](./01-PRODUCT-SCOPE.md), [10 Personalisation](./10-PERSONALIZATION.md), [16 Data contracts](./16-DATA-CONTRACTS.md), [19 Decisions](./19-DECISIONS.md), [AI Coach plan](../coach/AI-COACH-PLAN.md) §8 (evaluation and user study).

## Goal

Today there are no users. Every match is visible to anyone who can reach the API, `/users/me/patterns` returns the sample fixture, the player picker asks "which of these ten is you?" on every upload, and the coach's `get_player_history` counts every match that SteamID appears in, whoever uploaded it.

After this plan a player can:

1. Sign in (with Steam, or with a local password when the demo machine is offline).
2. Upload a demo and have the app pick them as the coached player automatically.
3. Come back later to a library of their matches, a record of what they reviewed, what they asked and what they bookmarked.
4. See how their mistakes change across matches, with evidence ([19](./19-DECISIONS.md) #13).
5. Set their coach language and playback preferences once.
6. Export or delete everything the app holds about them.

And the project gets something it needs for the grade: per-person accounts for the 5 to 10 players in the user study ([AI Coach plan](../coach/AI-COACH-PLAN.md) §8), so every rating and task time is tied to a participant.

## Constraints

- **Self-hosted.** Runs on Pawel's PC. No hosted identity provider (Auth0, Clerk, Supabase Auth, Firebase). Steam sign-in is a redirect to Steam's OpenID page, not a hosted AI or auth service holding our data, so it fits [19](./19-DECISIONS.md) #16; it does need internet at sign-in time, which is why a local password stays as the fallback.
- **The API owns the data.** FastAPI and SQLite already hold matches, findings, moments, explanations and clip jobs. Auth goes in the same place, so there is one database and one place that checks ownership. The Next.js app stays a client.
- **Pair-of-students scope.** No microservices, no Keycloak, no email server. Every item below is sized with the [TASKS](../coach/TASKS.md) scale (S half a day, M one to two days, L three to five days).
- **Nothing breaks without it.** `RR_AUTH_ENABLED=false` (the default until the study) keeps today's behaviour so tests, the sample match and the other threads' branches keep working.

## What comparable products do

| Product | Sign in | Match history | What is worth borrowing | What to avoid |
|---|---|---|---|---|
| [Leetify](https://leetify.com/) | Steam; FACEIT linked separately | Automatic for Premier/competitive via [match-history authentication code plus a share code](https://leetify.com/blog/share-codes/); FACEIT via a [browser extension or upload API](https://leetify.com/blog/faceit-demo-upload-api/) | SteamID is the identity; the player is never asked "which one are you?"; history and trends per map | One overall rating number |
| [Scope.gg](https://scope.gg/) | Steam, then [link FACEIT](https://app.scope.gg/signup/sources) | [Stored "forever"](https://scope.gg/match-history/); synced after every game | A [dashboard](https://scope.gg/cs2-dashboard/) that shows change in blocks of 15 matches, per map | Aim-rank comparisons against Elo; pro-player benchmarks |
| [Refrag Coach](https://refrag.gg/coach/) | Steam | Automatic across Premier, Wingman, FACEIT | Match-ready message with a link to the breakdown; each weakness ends in a drill | Upsell chrome |
| Allstar | Steam + FACEIT | Automatic; [share codes](https://help.allstar.gg/hc/en-us/articles/19150960451735-How-do-I-find-my-share-codes-or-download-matches-in-CS2) | Clip library per user | Montage/social feed |
| CS Demo Manager | None (desktop app) | Local folder | Everything is local and the user owns the files | No accounts at all |

The common pattern: **Steam is the account, the SteamID is the player, and history builds itself.** Automatic import is how the big products fill that history, but both routes are heavy for us:

- **Matchmaking auto-import** needs a Steam Web API key, the user's match-history authentication code and a share code, and then a separate Steam bot account logged into CS2's Game Coordinator to turn each share code into a demo URL ([csgo-demodownloader](https://github.com/jannislehmann/csgo-demodownloader/blob/main/README.md)). Share codes also expire after 30 days.
- **FACEIT auto-import** needs FACEIT's [Downloads API](https://docs.faceit.com/getting-started/Guides/download-api/), which requires an application form and up to 30 days for approval.

So this plan keeps manual upload as the only import for the prototype and lists both auto-imports as "later" (section 9).

## Recommendation in one paragraph

Put auth in FastAPI: **Sign in through Steam (OpenID 2.0) as the main login, a username and password (Argon2id) as the offline fallback, server-side sessions in SQLite behind an HttpOnly cookie**, and proxy the API through Next.js so the cookie is first-party. Add an `owner_id` to matches and check it on every match route, the clip files and the coach tools. Then build, in order: auto-pick the signed-in player, the match library, settings (coach language first), Ask and review history, progress across matches, bookmarks and notes, export and delete, and invite codes for the user study.

## 1. Sign-in and sessions

### Options considered

| Option | Where it runs | Fit |
|---|---|---|
| **FastAPI-owned sessions (recommended)** | API, same SQLite | One database, one ownership check, Python only; Steam OpenID is ~60 lines (see [pySteamSignIn](https://github.com/TeddiO/pySteamSignIn), [steam-openid-fastapi](https://github.com/kellerkompanie/steam-openid-fastapi)) |
| Better Auth or Auth.js in Next.js | Web, its own tables | Good DX and [built-in passkeys](https://www.pkgpulse.com/guides/openauth-vs-better-auth-vs-authjs-v6-self-hosted-2026), but a second user store the API would have to trust through JWTs or a shared database; Steam needs a custom provider either way |
| Keycloak / Authentik / Authelia | Extra container | Real identity servers; far more to run and explain than a student prototype needs |
| No login, "profile picker" only | Web | Fast, but no privacy between study participants and nothing to show about auth |

### Design

- **Steam sign-in.** `GET /auth/steam/start` redirects to `https://steamcommunity.com/openid/login` with `return_to=/auth/steam/callback`. The callback re-posts the signed fields to Steam with `openid.mode=check_authentication`, accepts only `is_valid:true`, and takes the SteamID64 from the claimed ID `https://steamcommunity.com/openid/id/<steamid>` ([Steam docs](https://steamcommunity.com/dev)). Check that `return_to` matches our URL and reject a reused `openid.response_nonce`.
- **Name and avatar.** With an optional `RR_STEAM_API_KEY`, call `ISteamUser/GetPlayerSummaries` once at sign-in for persona name and avatar. Without a key, use the name the player has in their most recent demo, then "Player <last 4 digits>".
- **Local password.** `POST /auth/register` and `/auth/login` with a username and password, hashed with Argon2id (`argon2-cffi`). No email, so no reset by mail: the admin can reset a password from the command line (`python -m app.auth reset <user>`). A local account can link Steam later from Settings, which is how it gets its SteamID.
- **Sessions.** A random 32-byte token in an HttpOnly, SameSite=Lax cookie (`Secure` when served over HTTPS); only its SHA-256 is stored in `sessions`. 30-day sliding expiry, a new token on every sign-in, deleted on sign-out. This follows the [OWASP session management cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- **Same origin.** Add a Next.js rewrite from `/api/:path*` to the API and point `NEXT_PUBLIC_API_URL` at `/api`. The cookie is then first-party, `<video src>` for clips carries it without CORS credentials, and the SSE Ask stream works unchanged. Server components forward the cookie to `API_INTERNAL_URL`.
- **CSRF.** SameSite=Lax plus an `Origin` check on every non-GET request is enough here; no tokens in forms.
- **Brute force.** Five failed logins per username per 15 minutes, then a short wait, stored in SQLite.
- **Switch.** `RR_AUTH_ENABLED=false` makes every request run as a built-in `local` user, which owns all matches. That is today's behaviour.

### Screens

- `/signin`: "Sign in through Steam" (Steam's own button image, as their terms ask), a hairline, then username and password. One line under it: "Your demos stay on this computer."
- First sign-in goes to a short **welcome** step: coach language (en, pl, nl), and, for a local account, "Link your Steam account so we can find you in your demos" with a Skip.
- The top bar gets the avatar and name on the right, opening a small menu: Matches, Progress, Settings, Sign out.

## 2. Ownership and privacy of matches

This is the part that makes accounts real rather than cosmetic.

- `matches.owner_id` (and the same on analysis tables through the match). Upload sets it to the current user.
- **Every** `/matches/{id}/…` route loads the match through one `get_owned_match(match_id, user)` dependency that returns 404 (not 403) for someone else's match. That includes the `.mp4` clip routes, `/events`, `/ask` and `/knowledge` lookups tied to a match.
- The **coach tools and MCP server** get the user in their context. `get_player_history` counts only matches the same user owns, so a player's history is not built from other people's uploads of the same match.
- `/users/me/patterns` returns the signed-in user's real patterns (section 5) instead of the sample fixture; `/users/{id}/patterns` is removed.
- The **sample match** is owned by nobody and readable by everyone, flagged `is_sample`.
- Existing matches on Pawel's PC are given to the first admin account by a one-off migration.
- Files on disk move from `data/matches/<match>` to `data/users/<user>/matches/<match>` only if it is cheap; otherwise leave paths as they are, since the database check is what protects them.

A demo holds nine other players' names and SteamIDs. We show them inside the owner's own review only, never on anything shared (section 8), and never in exports other than the owner's own match data.

## 3. The coached player picks themselves

The biggest daily win from accounts: when the signed-in user's SteamID is one of the ten players in the demo, skip the picker and start the coach straight away. The processing page says "Coaching you (Pawel, CT first). Change" with a link back to the picker. If the SteamID is not in the demo (a friend's POV, or a local account with no Steam link), the picker shows as today with a "You" marker on nobody. This slots into polish plan item 6 (processing).

Touches `app/processing/pipeline.py` (after `awaiting_player`), `POST /matches/{id}/player`, `PlayerPicker.tsx`.

## 4. Match library and history

Polish plan item 7 turns Home into a table of matches. With accounts, that table becomes **My matches** and gains:

- Columns: map, score from the coached player's side, date played (from the demo, not the upload time), coached player, moments reviewed "4 of 6", status.
- Filters that earn their place: map (Mirage, Anubis), result, and "Not finished reviewing". A search box is not needed below about 50 matches.
- Row actions in a menu: Open, Rename, Re-run the coach (for when the model or detectors change), Delete.
- **Resume where you left off**: the review remembers the last moment and time, so "Continue" reopens it there.
- A processing row shows the live stage and, because there is one GPU, the queue position: "Waiting for the coach, 2nd in line".
- Storage line under the table: "12 matches, 3.1 GB of demos and clips", with a link to Settings, Data.

History the app should record per user:

| Record | Why | Stored in |
|---|---|---|
| Moments seen and when | "4 of 6" in the library, the review ending, resume | `review_progress` |
| Ask conversations per match and moment | Reopen a match and see what you asked; the user study needs them | `ask_threads`, `ask_messages` (question, answer, citations, trace id) |
| Feedback on explanations and answers ("Useful" / "Not right" + optional note) | Polish plan item 4; the evaluation chapter | `feedback` |
| Bookmarks on a time in a round, with a note | Mark a moment the coach did not pick | `bookmarks` |

The Ask thread is loaded into the Ask tab when the match opens, and the agent sees the last few turns of it, so follow-up questions work across visits.

## 5. Progress across matches

[10 Personalisation](./10-PERSONALIZATION.md) and [19](./19-DECISIONS.md) #13 already set the rules: evidence only, "N of M" with dots and the list of matches, no score. The data exists: `AnalysisRepository.player_history` counts findings per detector per match.

- A **Progress** page with one row per detector the user has triggered: the plain-language name ("Shooting while moving"), a line of dots, one per match, filled when it happened that match, and the rate per 10 rounds for the last 5 matches against the 5 before (only when there are 10 or more matches; otherwise just the dots). Scope.gg's blocks of 15 matches are the same idea at a larger scale.
- Per-map split for Mirage and Anubis.
- Each dot links to the match and the moment.
- A short coach summary at the top, written by the agent over `get_player_history` and verified like every other claim ("Shooting while moving happened in 5 of your last 6 matches [F…]"). Skip it until there are 3 matches.
- Good plays get the same treatment (D10), so the page is not a list of failures.
- In the Studio, the moment panel gains the line [10](./10-PERSONALIZATION.md) describes: "Also in 3 of your last 5 matches", with the dots.

Touches a new `app/progress/page.tsx`, `GET /users/me/progress`, the `get_player_history` scope change from section 2.

## 6. Settings

One page, four sections, plain rows, no cards:

- **Profile**: name, avatar (from Steam or initials), linked Steam account (link or unlink), change password for local accounts.
- **Coach**: answer language (en, pl, nl, per [19](./19-DECISIONS.md) #19), explanation length (short, normal). The language setting is passed to every agent job and Ask call instead of a request parameter.
- **Playback**: open on Gameplay or Radar, autoplay the clip when a moment opens, show the kill feed, reduced motion (default from the OS).
- **Data**: storage used; **Export my data** (a zip of JSON: account, matches list, findings, moments, explanations, Ask history, feedback, bookmarks; demos and clips optional because of size); **Delete a match** from the library; **Delete my account** (type your username to confirm; removes the rows, the demo and clip files and the traces for that user). Signed-in devices with "Sign out of other sessions".

Deletion matters in practice: the study participants are in the EU, so the consent form should say what is stored and how to remove it, and the delete button has to actually do it.

## 7. The user study: invites and roles

- Two roles: `admin` and `player`. The first account created is admin.
- Registration is **invite-only** once auth is on: the admin makes a code in an **Admin** page (or `python -m app.auth invite`), which a participant uses once to create a local account or to finish a Steam sign-in. This keeps a PC reachable over a school network or a tunnel from filling up with strangers.
- The admin page lists users, their match count, storage, and study status, and can export all feedback and Ask logs as CSV for the report (pseudonymous: user ids, no names).
- A per-user upload limit (`RR_MAX_MATCHES_PER_USER`, default 20) and the one-GPU queue from section 4 keep one participant from blocking the others.
- A consent checkbox on first sign-in when `RR_STUDY_MODE=true`, with the text in `docs/coach/`.

## 8. Sharing a review (optional)

A "Share" action on a match creates a read-only link with a random token (`/r/<token>`), revocable from the match menu. The shared view shows the coached player's moments, clips, radar and the coach's explanations; it hides Ask, feedback, bookmarks and other players' SteamIDs (names only). It is useful for showing a teammate or a grader without signing them in. Worth it only if time allows; it is also the one feature that makes a leaked link matter, so keep it off by default.

## 9. Later, not for the prototype

- **Automatic matchmaking import** via match-history authentication code and share codes (needs a Steam Web API key and a bot account on the Game Coordinator; section "What comparable products do").
- **FACEIT link and import** via FACEIT Connect OAuth2 ([account linking](https://docs.faceit.com/getting-started/authentication/oauth2/)) and the Downloads API (needs approval).
- Passkeys (WebAuthn) for local accounts.
- Notifications ("your review is ready") beyond the page itself; the processing page already says it is safe to leave.
- Teams: a coach seeing several players' matches.

## 10. Data model

New tables in the same SQLite database as `AnalysisRepository` (a new `repositories/users.py`), plus one column on `matches`:

```
users(id, username UNIQUE NULL, display_name, avatar_url, role, password_hash NULL, created_at, deleted_at NULL)
identities(user_id, provider 'steam', subject steamid64, created_at, PRIMARY KEY(provider, subject))
sessions(token_hash PRIMARY KEY, user_id, created_at, last_seen_at, expires_at, user_agent)
user_settings(user_id PRIMARY KEY, json)            -- language, playback, explanation length
invites(code_hash PRIMARY KEY, created_by, used_by NULL, expires_at)
login_attempts(key, at)
matches.owner_id                                    -- NULL only for the sample match
review_progress(user_id, match_id, moment_id, seen_at, last_t, PRIMARY KEY(user_id, match_id, moment_id))
ask_threads(id, user_id, match_id, player_id, moment_id NULL, created_at)
ask_messages(id, thread_id, role, text, citations_json, trace_id NULL, lang, created_at)
feedback(id, user_id, match_id, target, kind 'explanation'|'answer', verdict, note NULL, created_at)
bookmarks(id, user_id, match_id, round, t, note, created_at)
share_links(token_hash PRIMARY KEY, match_id, created_by, created_at, revoked_at NULL)
```

Pydantic models go in `models/contracts.py` first, then `lib/contracts/` ([16](./16-DATA-CONTRACTS.md) sync rule): `User`, `UserSettings`, `MatchListItem`, `AskThread`, `Feedback`, `Bookmark`, `ProgressRow`.

Migrations stay the way the repo does them today (`CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ADD COLUMN` on open); no Alembic for a prototype.

## 11. API surface

```
GET  /auth/steam/start            GET  /auth/steam/callback
POST /auth/register               POST /auth/login          POST /auth/logout
GET  /users/me                    PATCH /users/me           DELETE /users/me
GET  /users/me/settings           PUT  /users/me/settings
GET  /users/me/sessions           DELETE /users/me/sessions/{id}
GET  /users/me/progress           GET  /users/me/export
GET  /matches                     (owned, with filters)      PATCH /matches/{id}  DELETE /matches/{id}
GET  /matches/{id}/ask-threads    POST /matches/{id}/feedback
GET|POST|DELETE /matches/{id}/bookmarks
POST /matches/{id}/progress       (moment seen, last time)
POST /matches/{id}/share          DELETE /matches/{id}/share      GET /shared/{token}
GET  /admin/users                 POST /admin/invites       GET /admin/study-export
```

## 12. Tests and security checks

- Ownership: a parametrised test that walks **every** `/matches/{id}` route (including the `.mp4` ones) as a second user and expects 404. New routes fail the test until they use `get_owned_match`.
- Steam callback: a forged `openid.claimed_id`, a wrong `return_to`, a reused nonce, and Steam answering `is_valid:false` all fail; tests mock Steam, so CI needs no internet.
- Sessions: expired and signed-out tokens are rejected; the token is not in the database in plain text.
- Coach tools: `get_player_history` never counts another user's match.
- Delete account removes rows, files and traces (check the folders are gone).
- Playwright (`tools/qa/`): sign in locally, upload the sample, auto-pick, review one moment, sign out, confirm the match URL now asks to sign in.
- A run of the `security-review` checklist on the auth PR before it merges.

## 13. Tasks

Same format and sizes as [TASKS](../coach/TASKS.md). Pawel assigns them.

| ID | Task | Depends | Paths | Done when | Size |
|---|---|---|---|---|---|
| A00 | Next.js `/api` rewrite; client uses same-origin URLs; cookie forwarding in server fetches | – | `next.config.ts`, `lib/api/client.ts` | all current pages and clips work through `/api`; typecheck and build green | S |
| A01 | Users, sessions, local register/login/logout, Argon2id, `RR_AUTH_ENABLED` switch, `current_user` dependency | A00 | `repositories/users.py`, `app/auth/`, routes, config | tests in section 12 for sessions and passwords; auth off keeps the existing test suite green | M |
| A02 | Steam OpenID sign-in, optional `GetPlayerSummaries`, link/unlink Steam | A01 | `app/auth/steam.py` | mocked callback tests; a real sign-in on Pawel's PC | M |
| A03 | `owner_id`, `get_owned_match` on every match route and clip file, migration to the first admin, sample readable by all | A01 | routes, `repositories/matches.py` | route-walking ownership test passes | M |
| A04 | Coach tools and MCP server scoped to the user; `get_player_history` owned matches only | A03 | `coach/tools.py`, `coach/mcp_server.py` | tool test with two users | S |
| A05 | Sign-in page, welcome step, account menu in the top bar | A01 | `app/signin/`, `components/` | Playwright sign-in flow | M |
| A06 | Auto-pick the signed-in player; "Coaching you. Change" | A02 A03 | pipeline, `PlayerPicker.tsx` | test: SteamID in demo skips the picker; not in demo shows it | S |
| A07 | Settings page: profile, coach language, playback; language fed to agent jobs and Ask | A01 | `app/settings/`, `coach/jobs.py` | changing language changes the next explanation's language | M |
| A08 | `GET /matches` and My matches (builds on polish item 7): filters, row menu, resume, queue position | A03 | `app/page.tsx`, routes | library shows only own matches; resume opens the last moment | M |
| A09 | Review progress and Ask history stored and reloaded | A03 | repositories, `CoachPanel.tsx` | reopening a match shows past questions and "4 of 6" | M |
| A10 | Feedback and bookmarks (feedback UI is polish item 4) | A03 | routes, `CoachExplanation.tsx`, timeline | stored per user; bookmark seeks | S |
| A11 | Progress page and "Also in N of your last M" line | A04 | `app/progress/`, `GET /users/me/progress` | page renders from real history; every claim cites | M |
| A12 | Export and delete (match and account), sessions list | A03 A09 A10 | routes, settings Data section | delete test removes rows and files | M |
| A13 | Invites, roles, admin page, study export CSV, consent, per-user limit | A01 | `app/admin/`, routes | a participant signs up with a code; CSV exports | M |
| A14 | Share links (optional) | A03 | routes, `app/r/[token]/` | revoked link returns 404; no SteamIDs in the shared view | S |

## 14. Suggested order

| When | Tasks |
|---|---|
| Before the intermediary defence (17 Nov) | A00 to A08: sign in, ownership, auto-pick, settings, library. This is what a grader sees in the first minute. |
| Before the user study | A09, A10, A13: history, feedback, invites. The study needs them to attribute ratings. |
| Before the prototype hand-in (6 Dec) | A11, A12: progress across matches, export and delete. |
| If time allows | A14 share links. Section 9 stays out of scope. |

A00 to A04 are plumbing with no visible UI, so they can run alongside the polish plan's items 1 to 4 without touching the same files, except `app/page.tsx` (A08 and polish item 7), which should be one task.

## Decisions for the owner

1. **How people sign in.** Steam plus a local password (recommended: Steam is what every CS2 tool uses and gives us the SteamID; the password keeps the demo working offline), local password only, or Steam only.
2. **Where the app is reachable during the study.** Only on Pawel's PC and LAN (recommended), through a private tunnel such as Tailscale, or on the public internet. Public exposure would need HTTPS, stricter limits and a real security review first.
3. **Automatic import.** Keep manual upload only for the prototype (recommended), or apply now for FACEIT's Downloads API (up to 30 days) so FACEIT import is possible later.

If Pawel agrees, record 1 and 3 as decisions 22 and 23 in [19](./19-DECISIONS.md) (21 is proposed by the polish plan).

## Sources

- Leetify: https://leetify.com/blog/share-codes/ and https://leetify.com/blog/faceit-demo-upload-api/
- Scope.gg: https://scope.gg/cs2-dashboard/, https://scope.gg/match-history/, https://app.scope.gg/signup/sources
- Refrag Coach: https://refrag.gg/coach/
- Allstar share codes: https://help.allstar.gg/hc/en-us/articles/19150960451735-How-do-I-find-my-share-codes-or-download-matches-in-CS2
- Matchmaking demo download mechanics: https://github.com/jannislehmann/csgo-demodownloader/blob/main/README.md
- Steam OpenID and Web API: https://steamcommunity.com/dev; https://github.com/TeddiO/pySteamSignIn; https://github.com/kellerkompanie/steam-openid-fastapi
- FACEIT: https://docs.faceit.com/getting-started/authentication/oauth2/ and https://docs.faceit.com/getting-started/Guides/download-api/
- Auth libraries: https://www.pkgpulse.com/guides/openauth-vs-better-auth-vs-authjs-v6-self-hosted-2026
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
