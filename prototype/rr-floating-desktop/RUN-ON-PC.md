# Run the floating desktop with accounts and everything on (Windows, PowerShell)

This runs the floating desktop against the real API: real demo parsing, the local coach model, CS Demo Manager clips, sign-in, roles and the Admin window. It uses its own clone and ports, **API 8005 and desktop 5174**, so it does not clash with the Docker app (8000/3000), cs2-demos-local (8003/3003), the first floating copy (8004/5173) or the others.

You need Git, Python 3.11 or newer, Node 20 or newer and Docker Desktop. For the coach you also need llama.cpp and a model. For clips you need CS2, Steam, CS Demo Manager, and `psql` on `PATH`.

The API must come from this branch. It includes PR #22 and PR #24 (accounts and the admin panel), and the desktop calls endpoints that `development` does not have yet. So don't point the desktop at another copy's API.

## 1. Clone the branch

```powershell
cd C:\Users\pawel\Documents
git clone -b claude/floating-admin-accounts-96wjtv https://github.com/PawelZlotkowski/cs2-demos.git cs2-demos-accounts
cd cs2-demos-accounts
```

To update it later: `git pull`.

## 2. Coach model (first terminal)

Only one model fits in the 16 GB, so stop any other llama-server first: `Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process`.

```powershell
cd C:\Users\pawel\llama.cpp
# Gemma 4 12B (what you ran on 27 Sep)
.\llama-server.exe -m C:\Users\pawel\models\gemma-4-12b-it-Q6_K.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
# or Qwen3-14B
# .\llama-server.exe -m C:\Users\pawel\models\Qwen3-14B-Q4_K_M.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
```

Check: `curl.exe -s http://127.0.0.1:8080/v1/models` names the model you started.

## 3. CS Demo Manager's database (once)

Start Steam and CS Demo Manager. Then, from the repo root:

```powershell
cd C:\Users\pawel\Documents\cs2-demos-accounts
docker compose --profile csdm up -d csdm-db
```

If the `csdm-postgres` container from another copy is already running, skip this: it is the same container and port. In CS Demo Manager, connect to `127.0.0.1:5432`, database `csdm`, user `postgres`, password `postgres`.

## 4. API (second terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-accounts\apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -e ".[dev]"
pip install -e ..\mcp

Set-Content -Encoding ascii .env @'
RR_LLM_ENABLED=true
RR_LLM_BASE_URL=http://127.0.0.1:8080/v1
RR_LLM_MODEL=gemma-4-12b-it-q6_k
RR_CSDM_ENABLED=1
RR_CSDM_MODE=csdm
RR_LAB_ENABLED=1
RR_AUTH_ENABLED=true
RR_SHARE_LINKS=true
'@
uvicorn app.main:app --reload --port 8005
```

- For Qwen, use `RR_LLM_MODEL=qwen3-14b-q4_k_m`.
- `pip install -e ".[dev]"` also installs `argon2-cffi` for passwords, so run it again if you reuse an older venv.
- Optional: `RR_STEAM_API_KEY=<key>` shows the Steam name and avatar. Steam sign-in works without it.
- Leave `RR_PUBLIC_URL` unset. Steam then sends you back to the address you opened, http://localhost:5174.
- Without `RR_AUTH_ENABLED` the desktop opens straight away as the local admin, as before.
- No CORS line is needed, because the desktop reaches the API through its own proxy.
- The API reads `.env` only when it starts, so restart it after any change.
- If `csdm` is not on `PATH` or in `%LOCALAPPDATA%\Programs\cs-demo-manager\`, add `RR_CSDM_BIN=<path to csdm.cmd>`.

Check that the settings loaded (venv active, in `apps\api`):

```powershell
python -c "from app.core.config import settings as s; print(s.llm_enabled, s.llm_model, s.csdm_enabled, s.csdm_mode, s.lab_enabled, s.auth_enabled)"
```

It should print `True gemma-4-12b-it-q6_k True csdm True True`.

## 5. Floating desktop (third terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-accounts\prototype\rr-floating-desktop
npm install
Set-Content -Encoding ascii .env.local 'RR_API_URL=http://127.0.0.1:8005'
npm run dev -- --port 5174 --strictPort
```

Open http://localhost:5174. Use `localhost`, not `127.0.0.1`: the sign-in cookie belongs to the address you opened.

## 6. Check it works

1. **Sign in:** the first visit shows the lock screen with "Create the admin account". The first account is the admin. Then the Setup Assistant asks for the coach language and offers to link Steam.
2. **Menu bar:** it shows the served model on the right instead of "Coach model off" or "API offline".
3. **Settings:** under System, every check should read Working: Coach model, Coach tools, Clip recording, Knowledge base, Run log. Anything that isn't says why.
4. **Add match:** the installer opens. The Introduction step names the model and "CS Demo Manager" for clips. Continue, drop a Mirage or Anubis `.dem` or `.dem.zst`, then Upload.
   - Reading the demo takes about a minute for a full match.
   - Pick the player and the language, then press Review.
   - Coach review runs moment picking (about 2 minutes with Gemma, 30 s with Qwen), then records each clip in CS2, then writes the explanations. Keep CS2 and Steam alone while it records.
5. **Open in Studio:** the brief, each moment with its POV clip on the stage and the radar in the corner, Ask, Round, Notes and Debrief.
   - Explaining any other round on the Round list records a clip of it in the background.
   - A failed clip has "Record again".
6. **Coach, Progress and Admin:** they fill once one match is reviewed. Admin (the shield in the dock, or the account menu at the top right) has Overview, Jobs, Model, Settings, Users, Invites, Study, Matches, Knowledge, Lab, Storage, Security and the audit log. The Lab's Runs show each model call.
7. **A second account:** in Admin, Invites, press Create Code. Sign out from the account menu, press "Create an account" and use the code. The new player sees only their own matches and no Admin.
8. **Match actions:** the "…" on a Matches row renames, shares a read-only link, opens earlier reviews or deletes the match.

You can close the installer at any time. Matches shows the progress, and clicking the match reopens the installer on its step.

## Troubleshooting

- **"API offline" in the menu bar:** the API isn't on 8005, or `.env.local` names another port. Restart `npm run dev` after editing `.env.local`.
- **Template explanations, "picked by code":** the API started before `RR_LLM_ENABLED=true` was in `.env`, or from another folder. Restart it from `apps\api` and run the check in step 4.
- **The wrong model answers:** an older llama-server still holds 8080. Stop them all (step 2) and start the one you want.
- **Clips read as skipped or failed:** CS Demo Manager or Steam isn't running, the database isn't up, or the two CS:DM lines are missing from `.env`. After fixing it, press "Record again" on the clip.
- **Two copies recording at once:** CS2 records one clip at a time. Stop the other copies' APIs, or turn their clips off, while you test this one.
- **Coach, Admin or sign-in errors with "Not Found":** the API is from another copy (without PR #22 or #24). Use this clone's API.
- **Signed out after every click, or "Origin not allowed" on save:** you opened `127.0.0.1` instead of `localhost`, or the API has `RR_PUBLIC_URL` set to another address.
- **Steam sign-in comes back with an error:** Steam returns to http://localhost:5174/api/auth/steam/callback, so open the desktop at exactly that address. A firewall blocking outgoing calls from Python also stops the check with Steam.
- **Forgot the admin password:** stop the API and start it once with `RR_AUTH_ENABLED=false`. You are then the local admin; in Admin, Users, make a reset code for your account, then turn accounts back on and use "I have a reset code" on the lock screen.

## Try it without a demo

`qa/dev_api.py` runs the same API with a scripted Mirage match instead of demoparser2, and stub clips. See the README.
