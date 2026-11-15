param([switch]$Check, [switch]$Recording, [switch]$Llm, [int]$ApiPort = 8003, [int]$WebPort = 3003)
$ErrorActionPreference = 'Stop'
$pythonPath = Join-Path $PSScriptRoot 'apps\api\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Missing API environment. See docs/LOCAL-V1-RUNBOOK.md.' }
$arguments = @((Join-Path $PSScriptRoot 'tools\local_app.py'), '--api-port', $ApiPort, '--web-port', $WebPort)
if ($Check) { $arguments += '--check' }
if ($Recording) { $arguments += '--recording' }
if ($Llm) { $arguments += '--llm' }
& $pythonPath @arguments
if ($LASTEXITCODE -ne 0) { throw "Local Studio exited with code $LASTEXITCODE. See .local/logs." }
