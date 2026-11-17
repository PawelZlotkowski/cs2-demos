[CmdletBinding()]
param(
    [ValidateSet('menu', 'start', 'stop', 'status', 'update', 'record', 'database', 'export-notes', 'import-notes', 'backup', 'restore', 'export-clips')]
    [string]$Action = 'menu',
    [string]$File,
    [string]$Labeller,
    [string[]]$Batch,
    [string]$PythonPath,
    [string]$CsdmPath,
    [string]$FfmpegPath,
    [ValidateRange(1, 128)][int]$SessionSize = 8,
    [switch]$StartRecorder,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$script:LabellerRoot = $PSScriptRoot

function Get-ComposeArguments {
    $arguments = @('compose', '--project-directory', $script:LabellerRoot,
        '-f', (Join-Path $script:LabellerRoot 'compose.labeler.yaml'))
    $configuration = Join-Path $script:LabellerRoot 'labeler.env'
    if (Test-Path -LiteralPath $configuration -PathType Leaf) {
        $arguments += @('--env-file', $configuration)
    }
    return $arguments
}

function Invoke-Compose([string[]]$Arguments) {
    $previousPreference = $ErrorActionPreference
    try {
        # Compose prints normal progress to stderr under Windows PowerShell 5.
        $ErrorActionPreference = 'Continue'
        & docker @(Get-ComposeArguments) @Arguments
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) { throw "Docker Compose failed (exit $exitCode). Read the message above." }
}

function Get-LabellerSetting([string]$Name, [string]$Default) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ($value) { return $value }
    $configuration = Join-Path $script:LabellerRoot 'labeler.env'
    if (!(Test-Path -LiteralPath $configuration)) { $configuration = Join-Path $script:LabellerRoot '.env' }
    if (Test-Path -LiteralPath $configuration -PathType Leaf) {
        $configured = $Default
        foreach ($line in Get-Content -LiteralPath $configuration) {
            if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=(.*)$')) {
                $configured = $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
        return $configured
    }
    return $Default
}

function Initialize-LabellerImage([switch]$IncludeDatabase) {
    $archive = Join-Path $script:LabellerRoot 'labeler-image.tar'
    if (!(Test-Path -LiteralPath $archive -PathType Leaf)) { return $false }
    $configuredImage = Get-LabellerSetting 'LABELER_IMAGE' 'round-labeler-labeler'
    $releasePath = Join-Path $script:LabellerRoot 'release.json'
    $release = $null
    if (Test-Path -LiteralPath $releasePath -PathType Leaf) {
        $release = Get-Content -LiteralPath $releasePath -Raw | ConvertFrom-Json
        if ($release.image -and $release.image -ne $configuredImage) {
            throw 'labeler.env selects a different image from release.json. Use the image supplied with this kit.'
        }
    }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $installed = & docker image inspect --format '{{.Id}}' $configuredImage 2>$null
        $present = $LASTEXITCODE -eq 0
        $databasePresent = !$IncludeDatabase
        if ($IncludeDatabase) {
            $databaseImage = 'postgres:17'
            if ($release.postgresImage) { $databaseImage = $release.postgresImage }
            $databaseId = & docker image inspect --format '{{.Id}}' $databaseImage 2>$null
            $databasePresent = $LASTEXITCODE -eq 0 -and (!$release.postgresImageId -or $databaseId -eq $release.postgresImageId)
        }
    } finally { $ErrorActionPreference = $previousPreference }
    if ($present -and (!$release.imageId -or $installed -eq $release.imageId) -and $databasePresent) { return $true }
    if ($release.imageArchiveSha256) {
        Write-Host 'Checking the bundled image before loading it...'
        $hasher = [Security.Cryptography.SHA256]::Create()
        $stream = [IO.File]::OpenRead($archive)
        try {
            $actualHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '')
        } finally {
            $stream.Dispose()
            $hasher.Dispose()
        }
        if ($actualHash -ne $release.imageArchiveSha256) {
            throw 'The bundled image checksum is incorrect. Extract a fresh copy of the kit.'
        }
    }
    & docker load -i $archive | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not load the bundled image.' }
    $loaded = & docker image inspect --format '{{.Id}}' $configuredImage
    if ($LASTEXITCODE -ne 0 -or ($release.imageId -and $loaded -ne $release.imageId)) {
        throw 'The loaded image does not match the kit release.'
    }
    if ($IncludeDatabase) {
        $loadedDatabase = & docker image inspect --format '{{.Id}}' $databaseImage
        if ($LASTEXITCODE -ne 0 -or ($release.postgresImageId -and $loadedDatabase -ne $release.postgresImageId)) {
            throw 'The bundled database image does not match this release.'
        }
    }
    return $true
}

function Test-DatabasePort([string]$HostName, [int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $connection = $client.ConnectAsync($HostName, $Port)
        return $connection.Wait(1500) -and $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

function Get-RecorderDatabase {
    $settingsFile = Join-Path $env:USERPROFILE '.csdm/settings.json'
    if (Test-Path -LiteralPath $settingsFile -PathType Leaf) {
        $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
        if ($settings.database) {
            $database = $settings.database
            $hostname = $database.hostname
            $port = $database.port
            if (!$hostname) { $hostname = '127.0.0.1' }
            if (!$port) { $port = 5432 }
            return [pscustomobject]@{hostname=$hostname;port=$port}
        }
    }
    return $null
}

function Show-RecordingDatabaseConnection([int]$Port) {
    $configuration = Join-Path $script:LabellerRoot 'labeler.env'
    Write-Output 'In CS Demo Manager, open Settings > Database, choose External and connect using'
    Write-Output "Host 127.0.0.1, port $Port"
    Write-Output ("User " + (Get-LabellerSetting 'CSDM_DB_USER' 'postgres') + ", database " + (Get-LabellerSetting 'CSDM_DB_NAME' 'csdm'))
    Write-Output "Read CSDM_DB_PASSWORD from $configuration. It is stored only on this computer."
}

function Start-RecordingDatabase {
    $existing = Get-RecorderDatabase
    if ($existing.hostname -and $existing.port -and (Test-DatabasePort $existing.hostname ([int]$existing.port))) {
        Write-Output "CS Demo Manager already has a reachable database at $($existing.hostname):$($existing.port)."
        Write-Output 'Check Connect in CS Demo Manager to verify its saved credentials.'
        return
    }
    $port = [int](Get-LabellerSetting 'CSDM_DB_PORT' '5432')
    $ownDatabase = @(Invoke-Compose -Arguments @('--profile', 'recording', 'ps', '--status', 'running', '--quiet', 'csdm-db'))
    if ($ownDatabase.Count) {
        $published = (Invoke-Compose -Arguments @('--profile', 'recording', 'port', 'csdm-db', '5432') | Out-String).Trim()
        if ($published -match (':' + $port + '$')) {
            Invoke-Compose -Arguments @('--profile', 'recording', 'up', '-d', '--wait', 'csdm-db')
            Show-RecordingDatabaseConnection $port
            return
        }
    }
    if (Test-DatabasePort '127.0.0.1' $port) {
        throw "Port $port is in use. Connect CS Demo Manager to that existing database, or set CSDM_DB_PORT in labeler.env to a free port."
    }
    $null = Initialize-LabellerImage -IncludeDatabase
    $configuration = Join-Path $script:LabellerRoot 'labeler.env'
    if (!(Test-Path -LiteralPath $configuration)) {
        Copy-Item -LiteralPath (Join-Path $script:LabellerRoot 'labeler.env.example') -Destination $configuration
    }
    if (!(Get-LabellerSetting 'CSDM_DB_PASSWORD' '')) {
        $bytes = New-Object byte[] 24
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $password = -join ($bytes | ForEach-Object { $_.ToString('x2') })
        $lines = @(Get-Content -LiteralPath $configuration | Where-Object { $_ -notmatch '^\s*CSDM_DB_PASSWORD\s*=' })
        $lines += "CSDM_DB_PASSWORD=$password"
        [IO.File]::WriteAllLines($configuration, $lines, (New-Object Text.UTF8Encoding($false)))
    }
    Invoke-Compose -Arguments @('--profile', 'recording', 'up', '-d', '--wait', 'csdm-db')
    Show-RecordingDatabaseConnection $port
}

function Assert-DockerReady {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop, open it and choose Linux containers. Then run this launcher again.'
    }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $engine = & docker info --format '{{.OSType}}' 2>&1
        $engineExit = $LASTEXITCODE
        $null = & docker compose version 2>&1
        $composeExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($engineExit -ne 0) { throw 'Docker is unavailable. Open Docker Desktop and wait until its engine is running.' }
    if (($engine | Out-String).Trim() -ne 'linux') { throw 'Switch Docker Desktop to Linux containers, then try again.' }
    if ($composeExit -ne 0) { throw 'Docker Compose is unavailable. Update Docker Desktop and try again.' }
}

function Get-LabellerUrl {
    $published = @(Invoke-Compose -Arguments @('port', 'labeler', '8765'))
    $portMatch = [regex]::Match(($published | Out-String).Trim(), ':(\d+)\s*$')
    if (!$portMatch.Success) { throw 'The labeller has no published port. Choose Start labeller first.' }
    return "http://127.0.0.1:$($portMatch.Groups[1].Value)"
}

function Get-TransferArguments([string]$Command, [string]$TransferFile, [string]$Reviewer) {
    if ([string]::IsNullOrWhiteSpace($TransferFile)) { throw 'Provide a transfer file with -File.' }
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TransferFile)
    $folder = Split-Path -Parent $resolved
    $name = Split-Path -Leaf $resolved
    if (!$name -or !(Test-Path -LiteralPath $folder -PathType Container)) {
        throw 'Choose a file in an existing folder.'
    }
    if ($Command -in @('import-notes', 'restore') -and !(Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "The selected file does not exist: $resolved"
    }
    if ($Command -eq 'export-notes' -and [string]::IsNullOrWhiteSpace($Reviewer)) {
        throw 'Provide your labeller name with -Labeller.'
    }
    $arguments = @('run', '--rm', '--no-deps', '-v', "$($folder):/transfer",
        'labeler', 'python', '-m', 'app.annotation.transfer', $Command, "/transfer/$name")
    if ($Command -eq 'export-notes') { $arguments += @('--labeller', $Reviewer) }
    return $arguments
}

function Invoke-Transfer([string]$Command, [string]$TransferFile, [string]$Reviewer) {
    $arguments = Get-TransferArguments $Command $TransferFile $Reviewer
    $null = Initialize-LabellerImage
    $resume = $false
    if ($Command -in @('backup', 'restore')) {
        $resume = @(Invoke-Compose -Arguments @('ps', '--status', 'running', '--quiet', 'labeler')).Count -gt 0
        if ($resume) { Invoke-Compose -Arguments @('stop', 'labeler') }
    }
    try {
        Invoke-Compose -Arguments $arguments
    } finally {
        if ($resume) { Invoke-Compose -Arguments @('up', '-d', '--wait', '--no-build', 'labeler') }
    }
}

function Get-ClipBatches {
    $null = Initialize-LabellerImage
    try {
        $output = Invoke-Compose -Arguments @('run', '--rm', '--no-deps', '-T', 'labeler', 'python', '-m', 'app.annotation.clip_export', 'list', '--json')
    } catch {
        throw 'The labeller image does not include Export clips for web yet. Choose 5 (Update labeller from this folder), then try again.'
    }
    $line = @(($output | Out-String) -split '\r?\n' | Where-Object { $_.TrimStart().StartsWith('[') }) | Select-Object -Last 1
    if (!$line) { throw 'The labeller did not return its recording batches.' }
    $batches = @()
    foreach ($item in ($line | ConvertFrom-Json)) { $batches += $item }
    return ,$batches
}

function Invoke-ClipExport([string]$Destination, [string[]]$Batches) {
    if ([string]::IsNullOrWhiteSpace($Destination)) { throw 'Provide a destination folder with -File.' }
    if (!$Batches -or !$Batches.Count) { throw 'Choose at least one recording batch with -Batch.' }
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
    New-Item -ItemType Directory -Force -Path $resolved | Out-Null
    $null = Initialize-LabellerImage
    # The workspace volume is read inside a one-off container; only the destination is bind-mounted.
    $arguments = @('run', '--rm', '--no-deps', '-T', '-v', "$($resolved):/export",
        'labeler', 'python', '-m', 'app.annotation.clip_export', 'export', '/export')
    foreach ($identity in $Batches) {
        if ($identity -notmatch '^[a-f0-9]{32}$') { throw "Unknown recording batch: $identity" }
        $arguments += @('--batch', $identity)
    }
    Invoke-Compose -Arguments $arguments
    Write-Output "Clips exported to $resolved. In the web admin, open a collection and choose this folder."
}

function Show-ClipExportMenu {
    $batches = Get-ClipBatches
    if (!$batches.Count) { Write-Host 'There are no recording batches yet. Record clips first.'; return }
    Write-Host ''
    Write-Host 'Recording batches (map, demo, player):'
    foreach ($b in $batches) {
        Write-Host ('{0,3}  {1}, {2}, {3}: {4} ready of {5} clips, {6} MB' -f $b.number, $b.mapName, $b.demoFile, $b.playerName, $b.ready, $b.total, [math]::Round($b.readyBytes / 1e6))
    }
    $choice = (Read-Host 'Batches to export (numbers separated by commas, or all)').Trim()
    if (!$choice) { return }
    if ($choice -eq 'all') { $selected = @($batches | ForEach-Object { $_.batchId }) }
    else {
        $selected = @()
        foreach ($part in ($choice -split '[,\s]+' | Where-Object { $_ })) {
            $match = $batches | Where-Object { [string]$_.number -eq $part }
            if (!$match) { throw "There is no batch numbered $part." }
            $selected += $match.batchId
        }
    }
    $default = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('Round Reviewer web export ' + (Get-Date -Format 'yyyy-MM-dd HHmm'))
    $folder = (Read-Host "Destination folder (Enter for $default)").Trim('"')
    if (!$folder) { $folder = $default }
    Invoke-ClipExport $folder $selected
}

function Find-RecorderPython {
    $candidates = @()
    if ($PythonPath) { $candidates += ,@($PythonPath) }
    else {
        foreach ($name in @('py', 'python', 'python3')) {
            $command = Get-Command $name -ErrorAction SilentlyContinue
            if ($command -and $command.Source -notmatch '\\WindowsApps\\') {
                if ($name -eq 'py') { $candidates += ,@($command.Source, '-3') }
                else { $candidates += ,@($command.Source) }
            }
        }
        foreach ($relative in @('apps/api/.venv/Scripts/python.exe', '.venv/Scripts/python.exe')) {
            $candidate = Join-Path $script:LabellerRoot $relative
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidates += ,@($candidate) }
        }
    }
    foreach ($candidate in $candidates) {
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $binary, $prefix = $candidate
            $probe = @($prefix | Where-Object { $_ }) +
                @('-c', 'import sys; sys.exit(1) if sys.version_info < (3, 11) else print(sys.executable)')
            $resolved = & $binary @probe 2>$null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath ([string]$resolved) -PathType Leaf)) {
                return [string]$resolved
            }
        } catch {
            # Try the next installed interpreter.
        } finally {
            $ErrorActionPreference = $previousPreference
        }
    }
    throw 'Recording needs Python 3.11 or newer. Install Python, then reopen this launcher. Docker handles the labeller dependencies.'
}

function ConvertTo-ProcessArgument([string]$Argument) {
    if ($Argument -and $Argument -notmatch '[\s"]') { return $Argument }
    $escaped = [regex]::Replace($Argument, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Start-LabellerRecorder {
    $url = Get-LabellerUrl
    $database = Get-RecorderDatabase
    if (!$database.hostname -or !$database.port -or !(Test-DatabasePort $database.hostname ([int]$database.port))) {
        throw 'CS Demo Manager needs a working database connection. Choose Set up recording database, then open CS Demo Manager and connect it before recording.'
    }
    $python = Find-RecorderPython
    $runtime = Join-Path $script:LabellerRoot '.local'
    $cache = Join-Path $runtime 'label-recordings'
    $arguments = @('-u', (Join-Path $script:LabellerRoot 'tools/record_label_clips.py'),
        '--url', $url, '--cache', $cache, '--session-size', [string]$SessionSize)
    if ($CsdmPath) { $arguments += @('--csdm', $CsdmPath) }
    if ($FfmpegPath) { $arguments += @('--ffmpeg', $FfmpegPath) }
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $check = & $python @arguments --check 2>&1
        $checkExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    $detail = ($check | Out-String).Trim()
    if ($detail -match 'A recorder already owns this cache') {
        Write-Output 'A recorder is already running for this workspace.'
        return
    }
    if ($checkExit -ne 0) { throw "Recording is unavailable.$([Environment]::NewLine)$detail" }
    $stdout = Join-Path $runtime 'portable-recorder.stdout.log'
    $stderr = Join-Path $runtime 'portable-recorder.stderr.log'
    $processOptions = @{
        FilePath = $python
        ArgumentList = (($arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
        WorkingDirectory = $script:LabellerRoot
        WindowStyle = 'Hidden'
        RedirectStandardOutput = $stdout
        RedirectStandardError = $stderr
        PassThru = $true
    }
    $process = Start-Process @processOptions
    Start-Sleep -Milliseconds 750
    if ($process.HasExited) { throw "The recorder stopped. Open $stderr for its error." }
    Write-Output "Recorder started. Queue clips in the browser. Logs are in $runtime."
}

function Invoke-LabellerAction([string]$Command, [string]$TransferFile = '', [string]$Reviewer = '') {
    Assert-DockerReady
    switch ($Command) {
        'start' {
            $bundled = Initialize-LabellerImage
            if ($bundled) { Invoke-Compose -Arguments @('up', '-d', '--wait', '--no-build', '--pull', 'never', 'labeler') }
            else { Invoke-Compose -Arguments @('up', '-d', '--wait', 'labeler') }
            $url = Get-LabellerUrl
            Write-Output "Labeller ready at $url"
            if ($StartRecorder) { Start-LabellerRecorder }
            if (!$NoBrowser) { Start-Process $url }
        }
        'update' { Invoke-Compose -Arguments @('up', '-d', '--build', '--wait', 'labeler') }
        'stop' { Invoke-Compose -Arguments @('stop', 'labeler') }
        'status' { Invoke-Compose -Arguments @('--profile', 'recording', 'ps') }
        'record' { Start-LabellerRecorder }
        'database' { Start-RecordingDatabase }
        'export-clips' { Invoke-ClipExport $TransferFile $Batch }
        default { Invoke-Transfer $Command $TransferFile $Reviewer }
    }
}

function Show-LabellerMenu {
    while ($true) {
        Write-Host ''
        Write-Host 'Round Reviewer clip labeller'
        Write-Host '1  Start labeller and open browser'
        Write-Host '2  Record queued clips'
        Write-Host '3  Status'
        Write-Host '4  Stop labeller'
        Write-Host '5  Update labeller from this folder'
        Write-Host '6  Export my notes'
        Write-Host '7  Import notes'
        Write-Host '8  Back up workspace'
        Write-Host '9  Restore workspace'
        Write-Host 'W  Export clips for web'
        Write-Host 'D  Set up recording database'
        Write-Host '0  Exit'
        $choice = Read-Host 'Choose'
        if ($choice -eq '0' -or $choice -eq '') { return }
        $commands = @{'1'='start';'2'='record';'3'='status';'4'='stop';'5'='update';
            '6'='export-notes';'7'='import-notes';'8'='backup';'9'='restore';'D'='database';'W'='export-clips'}
        if (!$commands.ContainsKey($choice)) { Write-Host 'Choose one of the listed options.'; continue }
        try {
            $command = $commands[$choice]
            if ($command -eq 'export-clips') { Assert-DockerReady; Show-ClipExportMenu; continue }
            $transferFile, $reviewer = '', ''
            if ($command -in @('export-notes', 'import-notes', 'backup', 'restore')) {
                $transferFile = (Read-Host 'File path').Trim('"')
            }
            if ($command -eq 'export-notes') { $reviewer = Read-Host 'Your labeller name' }
            Invoke-LabellerAction $command $transferFile $reviewer
        } catch {
            Write-Host $_.Exception.Message -ForegroundColor Yellow
        }
    }
}

# Dot-sourcing exposes the command builders for isolated tests.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ($Action -eq 'menu') { Show-LabellerMenu }
        else { Invoke-LabellerAction $Action $File $Labeller }
    } catch {
        Write-Error $_.Exception.Message
        exit 1
    }
}
