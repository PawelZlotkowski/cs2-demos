# Windows-host API for the Docker web container (compose.recording.yaml), with CS Demo Manager
# recording and the self-hosted model on this PC. Mirrors tools/local_app.py's settings: saved
# matches in .local/data, local-v1 detectors, sign-in off, loopback only. It does not start
# Steam, CS2 or the model; start llama-server on port 8080 first.
param(
    [int]$Port = 8000,
    [string]$WebOrigin = 'http://localhost:3000',
    [string]$Model = 'gemma-4-12b-it-q6_k',
    [switch]$NoRecording,
    [switch]$NoLlm
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root 'apps\api\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Missing apps\api\.venv. See docs/LOCAL-V1-RUNBOOK.md.' }
$data = Join-Path $root '.local\data'

$env:RR_DATA_DIR = $data
$env:RR_UPLOAD_DIR = Join-Path $data 'uploads'
$env:RR_WORK_DIR = Join-Path $data 'work'
$env:RR_MATCHES_DIR = Join-Path $data 'matches'
$env:RR_TRACES_DIR = Join-Path $data 'traces'
$env:RR_LABELS_DIR = Join-Path $data 'labels'
$env:RR_DATASET_DIR = Join-Path $data 'dataset'
$env:RR_AUTH_ENABLED = 'false'
$env:RR_LOAD_SAVED_SETTINGS = 'false'
$env:RR_ANALYSIS_PROFILE = 'local-v1'
$env:RR_PARSE_TIMEOUT_SECONDS = '180'
$env:RR_PUBLIC_URL = $WebOrigin
$env:RR_CORS_ORIGINS = '["http://localhost:3000","http://127.0.0.1:3000"]'
$env:PYTHONUNBUFFERED = '1'

$env:RR_LLM_ENABLED = if ($NoLlm) { 'false' } else { 'true' }
$env:RR_LLM_BASE_URL = 'http://127.0.0.1:8080/v1'
$env:RR_LLM_MODEL = $Model

$env:RR_CSDM_ENABLED = if ($NoRecording) { 'false' } else { 'true' }
$env:RR_CSDM_MODE = 'csdm'
$env:RR_CSDM_ROUND_CLIPS = 'false'
if (-not $NoRecording) {
    $csdm = Get-Command csdm -ErrorAction SilentlyContinue
    if (-not $csdm) { throw 'csdm is not on PATH. Install CS Demo Manager or run with -NoRecording.' }
    $env:RR_CSDM_BIN = $csdm.Source
    $ffprobe = Join-Path $env:USERPROFILE '.csdm\ffmpeg\bin\ffprobe.exe'
    if (Test-Path -LiteralPath $ffprobe) { $env:RR_FFPROBE_BIN = $ffprobe }
}

Write-Host "API http://127.0.0.1:$Port  recording=$env:RR_CSDM_ENABLED  model=$env:RR_LLM_ENABLED ($Model)  data=$data"
Set-Location (Join-Path $root 'apps\api')
& $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
