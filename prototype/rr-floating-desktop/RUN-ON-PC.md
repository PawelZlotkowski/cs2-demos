# Run the floating desktop with everything on (Windows, PowerShell)

This runs the floating desktop against the real API: real demo parsing, the local coach model, CS Demo Manager clips and the Lab. It uses its own clone and ports, **API 8004 and desktop 5173**, so it does not clash with the Docker app (8000/3000), cs2-demos-local (8003/3003) or the other copies.

You need Git, Python 3.11 or newer, Node 20 or newer and Docker Desktop. For the coach you also need llama.cpp and a model. For clips you need CS2, Steam, CS Demo Manager, and `psql` on `PATH`.

The API must come from this branch. It includes PR #22, and the desktop's Coach, Progress, Settings, Lab and Notes call endpoints that `development` does not have yet. So don't point the desktop at cs2-demos-local's API.

## 1. Clone the branch

```powershell
cd C:\Users\pawel\Documents
git clone -b claude/floating-ui-backend-fod66a https://github.com/PawelZlotkowski/cs2-demos.git cs2-demos-floating
cd cs2-demos-floating
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
cd C:\Users\pawel\Documents\cs2-demos-floating
docker compose --profile csdm up -d csdm-db
```

If the `csdm-postgres` container from another copy is already running, skip this: it is the same container and port. In CS Demo Manager, connect to `127.0.0.1:5432`, database `csdm`, user `postgres`, password `postgres`.

## 4. API (second terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-floating\apps\api
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
'@
uvicorn app.main:app --reload --port 8004
```

- For Qwen, use `RR_LLM_MODEL=qwen3-14b-q4_k_m`.
- No CORS line is needed, because the desktop reaches the API through its own proxy.
- The API reads `.env` only when it starts, so restart it after any change.
- If `csdm` is not on `PATH` or in `%LOCALAPPDATA%\Programs\cs-demo-manager\`, add `RR_CSDM_BIN=<path to csdm.cmd>`.

Check that the settings loaded (venv active, in `apps\api`):

```powershell
python -c "from app.core.config import settings as s; print(s.llm_enabled, s.llm_model, s.csdm_enabled, s.csdm_mode, s.lab_enabled)"
```

It should print `True gemma-4-12b-it-q6_k True csdm True`.

## 5. Floating desktop (third terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-floating\prototype\rr-floating-desktop
npm install
Set-Content -Encoding ascii .env.local 'RR_API_URL=http://127.0.0.1:8004'
npm run dev
```

Open http://localhost:5173.

## 6. Check it works

1. **Menu bar:** it shows the served model on the right instead of "Coach model off" or "API offline".
2. **Settings:** under System, every check should read Working: Coach model, Coach tools, Clip recording, Knowledge base, Run log. Anything that isn't says why.
3. **Add match:** the installer opens. The Introduction step names the model and "CS Demo Manager" for clips. Continue, drop a Mirage or Anubis `.dem` or `.dem.zst`, then Upload.
   - Reading the demo takes about a minute for a full match.
   - Pick the player and the language, then press Review.
   - Coach review runs moment picking (about 2 minutes with Gemma, 30 s with Qwen), then records each clip in CS2, then writes the explanations. Keep CS2 and Steam alone while it records.
4. **Open in Studio:** the brief, each moment with its POV clip on the stage and the radar in the corner, Ask, Round, Notes and Debrief.
   - Explaining any other round on the Round list records a clip of it in the background.
   - A failed clip has "Record again".
5. **Coach, Progress and Lab:** they fill once one match is reviewed. The Lab's Runs show each model call.

You can close the installer at any time. Matches shows the progress, and clicking the match reopens the installer on its step.

## Troubleshooting

- **"API offline" in the menu bar:** the API isn't on 8004, or `.env.local` names another port. Restart `npm run dev` after editing `.env.local`.
- **Template explanations, "picked by code":** the API started before `RR_LLM_ENABLED=true` was in `.env`, or from another folder. Restart it from `apps\api` and run the check in step 4.
- **The wrong model answers:** an older llama-server still holds 8080. Stop them all (step 2) and start the one you want.
- **Clips read as skipped or failed:** CS Demo Manager or Steam isn't running, the database isn't up, or the two CS:DM lines are missing from `.env`. After fixing it, press "Record again" on the clip.
- **Two copies recording at once:** CS2 records one clip at a time. Stop the other copies' APIs, or turn their clips off, while you test this one.
- **Coach or Lab errors with "Not Found":** the API is from another copy (without PR #22). Use this clone's API.

## Try it without a demo

`qa/dev_api.py` runs the same API with a scripted Mirage match instead of demoparser2, and stub clips. See the README.
