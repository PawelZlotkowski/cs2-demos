# Coach task board

A small Next.js app that shows the tasks from [`docs/coach/TASKS.md`](../../docs/coach/TASKS.md) and lets both partners set an owner, a status (to do, doing, review, done) and a short note per task. It also shows which tasks are ready to start because everything they depend on is done.

## How the data works

- `scripts/sync-tasks.mjs` parses `docs/coach/TASKS.md` into `src/data/tasks.json`. It runs before `dev` and `build`, so the board picks up new or edited tasks on every deploy. Commit the regenerated `tasks.json` with any change to `TASKS.md`.
- Owner, status and note changes made in the app are stored separately, on top of that seed. With Upstash Redis configured they are shared between everyone who opens the site. Without it, they stay in the current browser only.
- Changes in the app are not written back to `TASKS.md`. Use **Copy owner/status table** when you want to update the markdown for agents.
- **Reset to seed** (in a task's details) drops the app's change for that task.

## Run locally

```bash
cd apps/tracker
npm install
npm run dev   # http://localhost:3100
```

Copy `.env.example` to `.env.local` and fill it in to test shared storage locally.

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import `PawelZlotkowski/cs2-demos`.
2. Set **Root Directory** to `apps/tracker`. Keep the Next.js preset and the default build settings. Leave "Include files outside the root directory" on (the default), so the build can read `docs/coach/TASKS.md`; if it is off, the committed `tasks.json` is used.
3. Deploy. The board works at this point, with changes kept per browser.
4. For shared changes, open the project's **Storage** tab, add **Upstash for Redis** from the marketplace (free plan) and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
5. Optional: add a `TRACKER_PASSCODE` environment variable. Anyone can then view the board, but only people who type the passcode at the top can change it.
6. Redeploy so the new environment variables apply.

The production branch in Vercel decides which version of `TASKS.md` the board shows. Until the coach docs are merged into `main`, set the production branch to the branch that has them, or deploy that branch as a preview.
