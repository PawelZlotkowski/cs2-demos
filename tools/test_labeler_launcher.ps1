$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../labeler.ps1')

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if (($Actual | ConvertTo-Json -Depth 10 -Compress) -ne ($Expected | ConvertTo-Json -Depth 10 -Compress)) {
        throw $Message
    }
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ("rr-launcher-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
$script:LabellerRoot = $temporary
try {
    Assert-Equal (Get-ComposeArguments) @('compose', '--project-directory', $temporary, '-f', (Join-Path $temporary 'compose.labeler.yaml')) 'Default Compose arguments changed.'
    Set-Content -LiteralPath (Join-Path $temporary 'labeler.env') -Value 'LABELER_PORT=9876'
    $arguments = Get-ComposeArguments
    Assert-Equal $arguments[-2] '--env-file' 'Optional configuration is not passed to Compose.'
    Assert-Equal $arguments[-1] (Join-Path $temporary 'labeler.env') 'Wrong environment file.'
    Assert-Equal (Get-LabellerSetting 'LABELER_PORT' '8765') '9876' 'Environment configuration was not read.'

    $file = Join-Path $temporary 'review notes [1].json'
    Set-Content -LiteralPath $file -Value '{}'
    $arguments = Get-TransferArguments 'export-notes' $file 'reviewer_one'
    Assert-Equal $arguments @('run', '--rm', '--no-deps', '-v', "$($temporary):/transfer", 'labeler', 'python', '-m', 'app.annotation.transfer', 'export-notes', '/transfer/review notes [1].json', '--labeller', 'reviewer_one') 'Transfer paths or arguments were split incorrectly.'
    Push-Location -LiteralPath $temporary
    try {
        $relative = Get-TransferArguments 'import-notes' 'review notes [1].json' ''
        Assert-Equal $relative[4] "$($temporary):/transfer" 'Relative transfer path ignored the current PowerShell location.'
    } finally { Pop-Location }
    $rejected = $false
    try { Get-TransferArguments 'import-notes' (Join-Path $temporary 'missing.json') '' | Out-Null } catch { $rejected = $true }
    Assert-Equal $rejected $true 'A missing import was accepted.'
    Assert-Equal (ConvertTo-ProcessArgument 'C:\Path with spaces\file.py') '"C:\Path with spaces\file.py"' 'Native path quoting is incorrect.'
    Assert-Equal (ConvertTo-ProcessArgument 'C:\Path with spaces\') '"C:\Path with spaces\\"' 'Trailing backslash quoting is incorrect.'

    $script:Calls = New-Object Collections.Generic.List[object]
    $script:Running = $true
    $script:FailTransfer = $true
    function Invoke-Compose([string[]]$Arguments) {
        $script:Calls.Add(@($Arguments))
        if ($Arguments[0] -eq 'ps' -and $script:Running) { return 'synthetic-container' }
        if ($Arguments[0] -eq 'run' -and $script:FailTransfer) { throw 'Synthetic transfer failure.' }
    }
    $rejected = $false
    try { Invoke-Transfer 'backup' $file '' } catch { $rejected = $true }
    Assert-Equal $rejected $true 'Transfer failure was swallowed.'
    Assert-Equal $script:Calls[1] @('stop', 'labeler') 'Backup did not stop the running API.'
    Assert-Equal $script:Calls[3] @('up', '-d', '--wait', '--no-build', 'labeler') 'Backup failure did not restore the running state.'
    $script:Calls.Clear()
    $script:Running = $false
    $script:FailTransfer = $false
    Invoke-Transfer 'restore' $file ''
    Assert-Equal $script:Calls.Count 2 'Restore started a previously stopped server.'

    $archive = Join-Path $temporary 'labeler-image.tar'
    Set-Content -LiteralPath $archive -Value 'Synthetic image data'
    $release = @{image='round-labeler-labeler'; imageId='sha256:synthetic'; imageArchiveSha256=(Get-FileHash $archive).Hash;
        postgresImage='postgres:17'; postgresImageId='sha256:database'}
    $release | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $temporary 'release.json')
    $script:ImageLoaded = $false
    $script:DatabaseLoaded = $false
    function docker {
        if ($args[0] -eq 'image') {
            if ($args[-1] -eq 'postgres:17') {
                if ($script:DatabaseLoaded) { $global:LASTEXITCODE = 0; return 'sha256:database' }
            } elseif ($script:ImageLoaded) { $global:LASTEXITCODE = 0; return 'sha256:synthetic' }
            $global:LASTEXITCODE = 1
        } elseif ($args[0] -eq 'load') {
            $script:ImageLoaded = $true
            $script:DatabaseLoaded = $true
            $global:LASTEXITCODE = 0
        } else { throw 'Unexpected Docker command in image test.' }
    }
    Assert-Equal (Initialize-LabellerImage) $true 'Offline image was not loaded.'
    Assert-Equal $script:ImageLoaded $true 'Offline image loader did not call Docker.'
    $script:DatabaseLoaded = $false
    Assert-Equal (Initialize-LabellerImage -IncludeDatabase) $true 'A missing database image was skipped when the app was installed.'
    Assert-Equal $script:DatabaseLoaded $true 'Database image was not loaded from the shared archive.'
    $script:ImageLoaded = $false
    Add-Content -LiteralPath $archive -Value 'Corrupt archive'
    $rejected = $false
    try { Initialize-LabellerImage | Out-Null } catch { $rejected = $true }
    Assert-Equal $rejected $true 'Corrupt offline image was accepted.'
    Assert-Equal $script:ImageLoaded $false 'Corrupt image was passed to Docker.'

    function Get-RecorderDatabase { return $null }
    function Test-DatabasePort { return $false }
    function Initialize-LabellerImage { return $false }
    $script:Calls.Clear()
    $display = Start-RecordingDatabase | Out-String
    $password = Get-LabellerSetting 'CSDM_DB_PASSWORD' ''
    if ($password -notmatch '^[a-f0-9]{48}$') { throw 'Database password was not generated.' }
    if ($display.Contains($password)) { throw 'Database password appeared in launcher output.' }
    Assert-Equal $script:Calls[-1] @('--profile', 'recording', 'up', '-d', '--wait', 'csdm-db') 'Wrong database service.'
    function Invoke-Compose([string[]]$Arguments) {
        if ($Arguments -contains 'ps') { return 'synthetic-database' }
        if ($Arguments -contains 'port') { return '127.0.0.1:5432' }
        $script:Calls.Add(@($Arguments))
    }
    function Test-DatabasePort { return $true }
    $script:Calls.Clear()
    Start-RecordingDatabase | Out-Null
    Assert-Equal $script:Calls[0] @('--profile', 'recording', 'up', '-d', '--wait', 'csdm-db') 'Existing database was mistaken for a port collision.'
    Assert-Equal (Get-LabellerSetting 'CSDM_DB_PASSWORD' '') $password 'Repeated database setup changed its password.'

    Write-Output 'Launcher checks passed for Compose settings, spaced paths, imports, process quoting and backup recovery.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolved).StartsWith('rr-launcher-test-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
