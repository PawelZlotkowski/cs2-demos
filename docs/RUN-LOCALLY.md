# Run and test locally (Windows, PowerShell)

Every command to run Round Reviewer on the Windows PC and check it, in order. It uses its own
clone and its own ports, **API 8003 and web 3003**, so it does not clash with the Docker app
(8000/3000) or the other working copies (8001/3001, 8002).

You need Git, Python 3.11 or newer, Node 22 and Docker Desktop. For the coach you also need
llama.cpp and a model; for POV clips, CS2, Steam and CS Demo Manager.

## 1. Get a clean working copy

```powershell
cd C:\Users\pawel\Documents
git clone -b development https://github.com/PawelZlotkowski/cs2-demos.git cs2-demos-local
cd cs2-demos-local
```

Later, to update it: `git switch development; git pull`.

To test a pull request (replace `NN` with its number), then go back:

```powershell
git fetch origin pull/NN/head:pr-NN
git switch pr-NN
# ... test ...
git switch development
```

After switching, rerun `pip install -e ".[dev]"` and `npm install` if the PR touched
`pyproject.toml` or `package.json`.

## 2. API (first terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -e ".[dev]"
pip install -e ..\mcp
```

Settings come from `apps/api/.env` (read from the folder you start the API in; it is git-ignored).
Start with the web port allowed and the model off:

```powershell
Set-Content -Encoding ascii .env @'
RR_CORS_ORIGINS=["http://localhost:3003","http://127.0.0.1:3003"]
RR_LLM_ENABLED=false
'@
uvicorn app.main:app --reload --port 8003
```

Check: open http://127.0.0.1:8003/health and http://127.0.0.1:8003/docs.

With the model off, the code ranker picks the moments and the English, Polish and Dutch templates
write the explanations, so the whole flow works without a GPU.

## 3. Web (second terminal)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\web
npm install
Set-Content -Encoding ascii .env.local 'API_INTERNAL_URL=http://127.0.0.1:8003'
npm run dev -- -p 3003
```

The browser calls `/api` on the web app and Next forwards it to that address, so the session
cookie, clips and the Ask stream stay on one origin. An older `.env.local` with
`NEXT_PUBLIC_API_URL=http://127.0.0.1:8003` still works; restart `npm run dev` after changing it.

Open http://localhost:3003, upload a `.dem.zst` or `.dem` (Mirage or Anubis), pick a player and
the Studio opens.

### Accounts and the admin panel (optional)

Without accounts the app is one person who is also the admin: the account menu (top right) opens
Settings and the admin panel at http://localhost:3003/admin. To add sign-in, put these in
`apps/api/.env` and restart the API:

```text
RR_AUTH_ENABLED=true
RR_PUBLIC_URL=http://localhost:3003
```

The first account you create becomes the admin and takes over the matches already on the PC.
Others need an invite code from Admin, Invites (`RR_SIGNUP=open` lets anyone sign up). Sign in
with Steam works without a key; `RR_STEAM_API_KEY` only adds names and avatars. Doc 30 lists
every setting.

## 4. Coach model (third terminal, optional)

Serve Qwen3-14B with llama.cpp on port 8080 (only one model fits in the 16 GB, so stop any other
llama-server first):

```powershell
cd C:\Users\pawel\llama.cpp
.\llama-server.exe -m C:\Users\pawel\models\Qwen3-14B-Q4_K_M.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
```

Or Gemma 4 12B instead:

```powershell
.\llama-server.exe -m C:\Users\pawel\models\gemma-4-12b-it-Q6_K.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
```

Then turn the coach on in `apps/api/.env` (stop the API with Ctrl+C first):

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\api
Set-Content -Encoding ascii .env @'
RR_CORS_ORIGINS=["http://localhost:3003","http://127.0.0.1:3003"]
RR_LLM_ENABLED=true
RR_LLM_BASE_URL=http://127.0.0.1:8080/v1
RR_LLM_MODEL=qwen3-14b-q4_k_m
'@
uvicorn app.main:app --reload --port 8003
```

For Gemma use `RR_LLM_MODEL=gemma-4-12b-it-q6_k`. The name picks the sampling profile (`qwen3`
or `gemma` in it is enough); `RR_LLM_SAMPLING`, `RR_LLM_TEMPERATURE`, `RR_LLM_TOP_P`,
`RR_LLM_TOP_K` and `RR_LLM_MIN_P` override it.

Matches processed before the model was on keep their template explanations; upload the demo again
to get model output.

## 5. POV clips (optional)

Needs CS2, Steam and CS Demo Manager running, plus `psql` from the PostgreSQL command line tools
on `PATH`. Start CS Demo Manager's database from the repo root:

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local
docker compose --profile csdm up -d csdm-db
```

In CS Demo Manager connect to `127.0.0.1:5432`, database `csdm`, user `postgres`, password
`postgres`. If the Docker app's `csdm-postgres` container from the other copy is already running,
skip this step: it is the same container and port.

Add these lines to `apps/api/.env` and restart the API:

```powershell
Add-Content -Encoding ascii .\apps\api\.env @'
RR_CSDM_ENABLED=1
RR_CSDM_MODE=csdm
'@
```

The API finds `csdm` on `PATH` or in `%LOCALAPPDATA%\Programs\cs-demo-manager\csdm.cmd`; set
`RR_CSDM_BIN` if it lives elsewhere. Without these lines, clips read as skipped and the Radar
works as usual. More settings: [replay/csdm-video.md](replay/csdm-video.md).

## 6. Tests and checks

API (venv active):

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\api
.\.venv\Scripts\Activate.ps1
pytest
```

It needs no GPU and should end with about 230 passed and 4 skipped. The live model test runs
only with llama-server up:

```powershell
$env:RR_LLM_LIVE = "1"; pytest tests/coach/test_llm_client.py -k live; Remove-Item Env:RR_LLM_LIVE
```

Web:

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\web
npm run typecheck
npm run lint
npm run build
```

## 7. Evaluation tools (from the repo root, API venv active)

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local
.\apps\api\.venv\Scripts\Activate.ps1

# Label rounds of a processed match (match folders are in apps\api\data\matches)
python -m eval.label_tool label --match-dir apps/api/data/matches/<match-id> --player <steamid64> --rounds 3,7,12 --labeller pawel
python -m eval.label_tool score (Get-ChildItem data\labels\*.jsonl).FullName   # PowerShell does not expand *

# Compare models on one processed match, with that model's llama-server running
python -m eval.compare_models run --match-id <match-id> --model qwen3-14b-q4_k_m --label qwen3-14b --langs en,pl,nl
# restart llama-server with Gemma, then
python -m eval.compare_models run --match-id <match-id> --model gemma-4-12b-it-q6_k --label gemma-4-12b --langs en,pl,nl
python -m eval.compare_models report eval/results/qwen3-14b.json eval/results/gemma-4-12b.json

# Rebuild the knowledge index after editing data/knowledge
cd apps\api; python -m app.rag.index
```

## 8. MCP server on its own (optional)

The API already runs the coach tools over MCP in-process. To poke at the server by itself:

```powershell
cd C:\Users\pawel\Documents\cs2-demos-local\apps\api
.\.venv\Scripts\Activate.ps1
python -m cs2_demo_mcp --transport http      # http://127.0.0.1:8765/mcp
npx @modelcontextprotocol/inspector python -m cs2_demo_mcp
```

## Troubleshooting

- **`ModuleNotFoundError: No module named 'argon2'` after pulling:** accounts added a dependency.
  Run `pip install -e ".[dev]"` again in `apps\api` with the venv active.
- **Every page sends you to Sign in:** accounts are on (`RR_AUTH_ENABLED=true`). Create the first
  account there, or set it to `false` and restart the API.

- **"picked by code (coach model unavailable)" and no requests in the llama-server window:** the API
  read `.env` before `RR_LLM_ENABLED=true` was in it, or was started from another folder. Restart it
  from `apps\api` and check what it loads:
  `python -c "from app.core.config import settings as s; print(s.llm_enabled, s.llm_model, s.csdm_enabled, s.csdm_mode)"`
- **The wrong model answers:** an older llama-server still holds port 8080.
  `curl.exe -s http://127.0.0.1:8080/v1/models` names the model file; stop them all with
  `Get-Process llama-server | Stop-Process` and start the one you want.
- **Clips read as skipped:** `RR_CSDM_ENABLED=1` and `RR_CSDM_MODE=csdm` are missing from `.env`.
- **`pytest` fails with `No module named 'demoparser2'`:** the venv is not active, so another Python
  (Anaconda) ran it. Activate `.venv` and use `python -m pytest`.
- **Moment picking takes about two minutes with Gemma:** expected; it reasons before answering
  (Qwen takes about 30 s).

## Docker instead

`docker compose up --build` from the repo root runs the API on 8000 and the web on 3000, with the
model and clips off. Both ports are open to this PC only (127.0.0.1); `RR_AUTH_ENABLED=true` in
the shell turns accounts on. It clashes with the Docker app in `cs2-demos`, so stop that one first
(`docker compose down` there).
