param([switch]$Check, [switch]$Recording, [switch]$Llm, [switch]$Prod, [int]$ApiPort = 8003, [int]$WebPort = 3003)
$ErrorActionPreference = 'Stop'
# Owner, 23 Nov 2026: a plain start runs the full app (model, recording, production web). Name switches to run a subset.
if (-not ($Check -or $Recording -or $Llm -or $Prod)) { $Recording = $Llm = $Prod = $true }
$pythonPath = Join-Path $PSScriptRoot 'apps\api\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Missing API environment. See docs/LOCAL-V1-RUNBOOK.md.' }
$arguments = @((Join-Path $PSScriptRoot 'tools\local_app.py'), '--api-port', $ApiPort, '--web-port', $WebPort)
if ($Check) { $arguments += '--check' }
if ($Recording) { $arguments += '--recording' }
if ($Llm) { $arguments += '--llm' }
if ($Prod) { $arguments += '--prod' }
& $pythonPath @arguments
if ($LASTEXITCODE -ne 0) { throw "Local Studio exited with code $LASTEXITCODE. See .local/logs." }
