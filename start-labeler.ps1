[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$InstallStartup,
    [int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'

if ($InstallStartup) {
    # Runs only in this user's interactive desktop: Steam/CS2 cannot capture as SYSTEM.
    $startup = [Environment]::GetFolderPath('Startup')
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Round Reviewer recorder.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Run -Port $Port"
    $shortcut.WorkingDirectory = $root
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Output 'Automatic recorder startup installed for this Windows user.'
}

if (!$Run) {
    Start-Process -FilePath $powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Run -Port $Port" -WorkingDirectory $root -WindowStyle Hidden
    Write-Output "Recorder supervisor started. Open http://127.0.0.1:$Port. Logs: $runtime/label-supervisor.log"
    exit
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\RoundReviewerLabelRecorder')
if (!$mutex.WaitOne(0)) { $mutex.Dispose(); exit }
try {
    Set-Location -LiteralPath $root
    $python = @('apps/api/.venv/Scripts/python.exe', '.venv/Scripts/python.exe') |
        ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$python) { throw 'Create the Python environment described in docs/LABEL-TOOL.md first.' }
    $log = Join-Path $runtime 'label-supervisor.log'
    function Invoke-LoggedNative([string]$Command, [string[]]$Arguments) {
        $previousPreference = $ErrorActionPreference
        try {
            # Windows PowerShell 5 treats normal native stderr (e.g. Compose's
            # progress) as error records. Decide success using the exit code.
            $ErrorActionPreference = 'Continue'
            & $Command @Arguments 2>&1 | Out-File $log -Append -Encoding utf8
            return $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
    }
    $env:LABELER_PORT = "$Port"
    while ($true) {
        try {
            # Docker may start later than this user session. Retry without dropping queued work.
            & docker info --format '{{.ServerVersion}}' *> $null
            if ($LASTEXITCODE -ne 0) { throw 'Waiting for Docker Desktop.' }
            if ((Invoke-LoggedNative 'docker' @('compose', '-f', 'compose.labeler.yaml', 'up', '-d', '--no-build')) -ne 0) {
                throw 'Labeler could not start; see supervisor log.'
            }
            # Reuse the existing CS:DM database; never create a replacement or change credentials.
            $database = & docker ps -a --filter 'name=^/csdm-postgres$' --format '{{.Names}}'
            if ($database -eq 'csdm-postgres') { $null = Invoke-LoggedNative 'docker' @('start', 'csdm-postgres') }
            if (!(Get-Process steam -ErrorAction SilentlyContinue)) {
                $steam = Join-Path ${env:ProgramFiles(x86)} 'Steam/steam.exe'
                if (Test-Path -LiteralPath $steam) { Start-Process -FilePath $steam -ArgumentList '-silent' -WindowStyle Hidden }
                throw 'Waiting for Steam. Sign in if Steam requests it.'
            }
            # Adopt a manually launched worker instead of starting a competing capture.
            $workers = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
                Where-Object { $_.CommandLine -match 'record_label_clips\.py' -and $_.CommandLine -notmatch '--check' }
            if ($workers) {
                Wait-Process -Id @($workers.ProcessId) -ErrorAction SilentlyContinue
                continue
            }
            "$(Get-Date -Format o) Starting recorder for port $Port" | Out-File $log -Append -Encoding utf8
            $null = Invoke-LoggedNative $python @('-u', 'tools/record_label_clips.py', '--url', "http://127.0.0.1:$Port", '--cache', "$runtime/label-recordings")
        } catch {
            "$(Get-Date -Format o) $($_.Exception.Message)" | Out-File $log -Append -Encoding utf8
        }
        Start-Sleep -Seconds 5
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
