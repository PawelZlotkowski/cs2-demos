# Hosted clip labeller (Round Reviewer clips)

Friends open one website, paste their personal access code, watch assigned clips and write what the selected player did well or could improve. You record and export clips on your PC, upload them in the admin panel, and import the finished notes back into the local labeller.

| Part | Where | What it holds |
|---|---|---|
| Website and API | Vercel project `round-reviewer-labels` (`apps/web`, `RR_WEB_MODE=clip-labeller`, functions in fra1) | Pages `/label/login`, `/label`, `/label/admin`; routes `/api/labeler/*` |
| Database | Supabase project `round-reviewer-labels` (eu-central-1) | Accounts, code digests, sessions, collections, assignments, clip source manifests, upload state, review revisions |
| Video | Private R2 bucket `cs2-demo-clips` (Standard) | One immutable MP4 object per clip |
| Recording, parsing, Qwen | Your PC only | Unchanged; reviewing works while the PC is off |

Reviewers never receive the detector finding, other people's notes, source IDs or Steam IDs. Browsers get only five-minute signed video URLs and ten-minute signed part-upload URLs; the server signs them after checking the session, role, assignment and publication in the database.

## One-time setup

Done already: the Supabase project and both migrations (`apps/web/supabase/migrations/`), the private R2 bucket, and the Vercel project with `RR_WEB_MODE`, `SUPABASE_URL` and `R2_BUCKET`. You do the steps that involve secrets:

1. **R2 API token.** Cloudflare dashboard → R2 → Manage API tokens → Create API token → *Object Read & Write*, **Apply to specific bucket only: `cs2-demo-clips`**. Keep the Access Key ID and Secret Access Key. On the bucket's Settings page copy the S3 API endpoint (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, without the bucket name). Leave Public access (r2.dev) disabled and add no custom domain.
2. **R2 CORS.** Bucket → Settings → CORS policy → paste, with the exact production address:
   ```json
   [
     {
       "AllowedOrigins": ["https://round-reviewer-labels.vercel.app"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   CORS only lets the page read `ETag` and stream video; every request still needs a signed URL. Put localhost and preview origins on a separate test bucket, never on this one.
3. **Vercel environment variables** (Project → Settings → Environment Variables, **Production** only, type *Sensitive*, no `NEXT_PUBLIC_` prefix):

   | Name | Value |
   |---|---|
   | `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key (`sb_secret_…`) |
   | `LABELER_CODE_PEPPER` | 48 random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it later invalidates every code. |
   | `R2_ENDPOINT` | the S3 endpoint from step 1 (EU-jurisdiction buckets use `…eu.r2.cloudflarestorage.com`) |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 1 |

   Already set: `RR_WEB_MODE=clip-labeller` (Production and Preview), `SUPABASE_URL`, `R2_BUCKET=cs2-demo-clips` and `LABELER_SITE_URL=https://round-reviewer-labels.vercel.app` (change it if Vercel assigns a different production address). Optional limits are listed in `apps/web/.env.labeler.example`.
   Preview deployments deliberately get no database or R2 secrets, so they show "This site is still being set up" and cannot write to production. Give previews their own test Supabase project and test bucket if you need them to work.
4. **Deploy** (the repository rule is no commits or pushes, so deploy the working tree with the CLI; `.vercelignore` uploads only `apps/web` and never demos, data or `.env` files):
   ```powershell
   cd C:\Users\pawel\Documents\cs2-demos-studio
   npx vercel@65.17.0 login
   npx vercel@65.17.0 link --project round-reviewer-labels --scope pawelzlotkowskis-projects
   npx vercel@65.17.0 deploy --prod
   ```
5. **Create your admin account** on your PC. Put the same values in `apps/web/.env.labeler.production.local` (ignored by git): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LABELER_CODE_PEPPER`. Then:
   ```powershell
   cd apps\web
   npm run labeler:admin -- check --env-file .env.labeler.production.local
   npm run labeler:admin -- bootstrap --handle pawel --name "Pawel" --env-file .env.labeler.production.local
   ```
   The code is printed once; save it in your password manager. Running bootstrap again changes nothing. If you lose the code: `npm run labeler:admin -- recover --handle pawel --env-file .env.labeler.production.local` issues a new one and signs out old admin sessions.

Deployment Protection stays on *Standard*: the production address is public (the code login protects it); individual deployment URLs and previews require a Vercel login.

## Everyday workflow

1. **Record** the demo and player in the local labeller as before.
2. **Export.** `Open labeller.cmd` → **W Export clips for web** → pick batches by map, demo and player → choose an empty folder. It writes `manifest.json` and `clips/*.mp4`. (After updating this folder, run **5 Update labeller** once.)
3. **Upload.** `/label/admin` → Collections → create one (for example *Ancient pilot, ten clips*) → **Choose folder** (or **Choose files instead**: select `manifest.json` and the MP4s together) → **Check files and upload**. Each file's SHA-256 is checked in the browser, sent in 8 MiB parts straight to R2, then re-hashed on the server before the clip becomes *Uploaded*. Interrupted? Choose the same folder again; finished parts are skipped. An upload older than six days restarts automatically.
4. **Publish** the uploaded clips you want (**Select uploaded clips shown → Publish selected**), then **Publish collection**.
5. **Assign** reviewers with the checkboxes. Each person's notes stay separate.
6. **Codes.** Reviewers tab → **Add reviewer and create code**. The code is shown once; **Copy message with code** gives this text to send:
   > Open https://round-reviewer-labels.vercel.app/label/login and paste your personal code. Choose Continue reviewing. Watch the selected player's clip, write what went well or what could be improved, then press Save and next. Use Skip for now if you need more context. Your notes save to your account, and you can return later on the same website.

Account actions: **New code** (old code and all sessions stop at once), **Sign out everywhere**, **Deactivate** (code and sessions stop; notes stay; reactivation issues a new code). The last active administrator cannot be deactivated. A video URL already issued can keep playing until its five minutes run out; no new URL is issued after revocation.

## Getting the notes back to Qwen

1. Admin → Reviewers → **Download notes** for each person (or Notes tab, filter by reviewer). The file is `round-reviewer-notes-v1`, origin = the cloud workspace ID shown on the Storage tab, labeller = their export handle, one entry per clip with the latest revision, drafts included so a withdrawn completion is withdrawn locally too. Skipped clips arrive as drafts.
2. On your PC: `Open labeller.cmd` → **7 Import notes** → that file. Repeated imports are safe; newer revisions replace older ones.
3. Qwen's examples use only notes that are **complete**, **footage-confirmed**, from a match whose provenance is **split = train** and **training permitted**, and from a different demo or source match than the one being explained. Set the split and permission on the PC before recording; they travel with the manifest and come back unchanged. Notes on unassigned, val or test matches never become examples.

**Handles:** a cloud handle and a local handle must differ if the same person labels in both places (for example `alex_web` online, `alex` locally). The importer refuses a cloud revision when the same handle has an independent local edit for that clip.

## Storage, limits and cost

The Storage tab shows bytes stored by this site, open upload reservations and the limits (defaults: 256 MiB per clip, 8 GiB stored plus reservations, 1,500 clips, 12 open uploads). The server enforces them, including concurrent reservations. These totals cover only this bucket; check your whole Cloudflare account under R2 → Overview.

Current numbers: the local ready queue holds 101 clips, 1,092,395,986 bytes (largest 17.1 MB). R2 Standard includes 10 GB-month of storage, 1 million Class A and 10 million Class B operations per month, shared by every bucket in the account, and no egress fee. Uploading a 17 MB clip uses about seven Class A operations (create, three parts, list, complete); playback, the size check and the server-side hash use Class B. Supabase Free gives 500 MB of database and pauses a project after a week without activity, so open the site before a presentation. Vercel Hobby covers the pages and small API calls; video bytes never pass through Vercel. Check current prices before going beyond the free allowances: https://developers.cloudflare.com/r2/pricing/ and https://supabase.com/pricing.

The bucket was created through the API and Cloudflare placed it in Eastern North America. It works from Europe; if you prefer European placement, delete the empty bucket before the first upload and recreate `cs2-demo-clips` in the dashboard with location hint *Western Europe*.

## Backups and rollbacks

- **Notes:** the database is the only copy until you import. Download every reviewer's notes before any schema change and after each review session, and import them locally (the local workspace backup, menu 8, then covers them).
- **Media:** your PC keeps the originals; the bucket holds copies. Nothing in the app deletes published media or review history; collection cleanup only aborts unfinished uploads.
- **Code:** a Vercel rollback (Instant Rollback to an earlier deployment) changes no data. Migrations are additive; never roll the database back. Add a new migration file instead and test it with `npm run test:labeler` first.
- **Ownership:** you own the Supabase project (database backups on paid plans only), the R2 bucket and the Vercel project.

## Developing and testing locally

```powershell
docker run -d --name rr-labeler-testdb -e POSTGRES_PASSWORD=labeler-test -p 127.0.0.1:55432:5432 postgres:17
cd apps\web
$env:LABELER_TEST_ADMIN_URL="postgres://postgres:labeler-test@127.0.0.1:55432/postgres"; npm run test:labeler
npm run typecheck
cd ..\..
apps\api\.venv\Scripts\python.exe -m pytest -q eval/tests/test_clip_export.py eval/tests/test_cloud_notes.py eval/tests/test_annotation_transfer.py
```

`node apps/web/scripts/dev-labeller.mjs` runs the labeller on http://localhost:3100 with a local S3 stand-in (`scripts/dev-s3.mjs`) and a disposable Postgres (`LABELER_DATABASE_URL` in `apps/web/.env.labeler.local`; refused on Vercel). The stand-in is for development only; real uploads must be checked against R2.
