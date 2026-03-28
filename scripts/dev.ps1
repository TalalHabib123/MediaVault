$ErrorActionPreference = "Stop"

function Require-Path {
    param(
        [string]$Path,
        [string]$Message
    )

    if (-not (Test-Path $Path)) {
        throw $Message
    }
}

function Get-DescendantProcessIds {
    param(
        [int]$ProcessId
    )

    $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $pending = [System.Collections.Generic.Queue[int]]::new()
    $found = [System.Collections.Generic.HashSet[int]]::new()
    $pending.Enqueue($ProcessId)

    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()

        foreach ($child in $allProcesses | Where-Object { $_.ParentProcessId -eq $current }) {
            if ($found.Add([int]$child.ProcessId)) {
                $pending.Enqueue([int]$child.ProcessId)
            }
        }
    }

    return @($found)
}

function Stop-ProcessTree {
    param(
        [int]$ProcessId
    )

    if ($ProcessId -le 0 -or $ProcessId -eq $PID) {
        return
    }

    $targets = @($ProcessId) + (Get-DescendantProcessIds -ProcessId $ProcessId)
    foreach ($targetId in ($targets | Sort-Object -Descending -Unique)) {
        try {
            Stop-Process -Id $targetId -Force -ErrorAction Stop
        } catch {
        }
    }
}

function Stop-StaleDevSessions {
    param(
        [string]$BackendTitle,
        [string]$FrontendTitle,
        [string]$WebPath
    )

    $processIds = @()

    $processIds += Get-Process powershell -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Id -ne $PID -and (
                $_.MainWindowTitle -eq $BackendTitle -or
                $_.MainWindowTitle -eq $FrontendTitle
            )
        } |
        Select-Object -ExpandProperty Id

    $cimProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)

    $processIds += $cimProcesses |
        Where-Object {
            $_.ProcessId -ne $PID -and (
                ($_.Name -ieq "powershell.exe" -and $_.CommandLine -like "*npm run dev*") -or
                ($_.Name -ieq "go.exe" -and $_.CommandLine -like "*run ./cmd/server*") -or
                ($_.Name -ieq "npm.cmd" -and $_.CommandLine -like "*run dev*") -or
                ($_.Name -ieq "cmd.exe" -and $_.CommandLine -like "*npm run dev*") -or
                ($_.Name -ieq "node.exe" -and $_.CommandLine -like "*vite*" -and $_.CommandLine -like "*$WebPath*") -or
                ($_.Name -like "server*.exe" -and $_.ExecutablePath -like "*AppData\\Local\\Temp\\go-build*")
            )
        } |
        Select-Object -ExpandProperty ProcessId

    $processIds = @($processIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)

    if ($processIds.Count -eq 0) {
        return
    }

    Write-Host "Stopping previous MediaVault dev sessions..."
    foreach ($processId in $processIds) {
        Stop-ProcessTree -ProcessId $processId
    }

    Start-Sleep -Milliseconds 750
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$appDir = Join-Path $repoRoot "app"
$webDir = Join-Path $appDir "web"

$goModPath = Join-Path $appDir "go.mod"
$packageJson = Join-Path $webDir "package.json"
$backendWindowTitle = "MediaVault Backend Watch"
$frontendWindowTitle = "MediaVault Frontend Dev"
$script:backendProcess = $null
$script:frontendProcess = $null
$script:changePending = $false
$script:lastRestartAt = [DateTime]::MinValue
$script:debounceWindow = [TimeSpan]::FromMilliseconds(500)
$script:watchers = @()
$script:subscriptions = @()
$script:backendExitNoticeShown = $false

Require-Path $appDir "Missing app folder: $appDir"
Require-Path $webDir "Missing web folder: $webDir"
Require-Path $goModPath "Missing go.mod at: $goModPath"
Require-Path $packageJson "Missing package.json at: $packageJson"

function Stop-BackendProcess {
    if ($null -eq $script:backendProcess) {
        return
    }

    Stop-ProcessTree -ProcessId $script:backendProcess.Id
    $script:backendProcess = $null
}

function Stop-FrontendProcess {
    if ($null -eq $script:frontendProcess) {
        return
    }

    Stop-ProcessTree -ProcessId $script:frontendProcess.Id
    $script:frontendProcess = $null
}

function Start-BackendProcess {
    Stop-BackendProcess

    Write-Host ""
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting backend server..."
    $script:backendProcess = Start-Process `
        -FilePath "go" `
        -ArgumentList @("run", "./cmd/server") `
        -WorkingDirectory $appDir `
        -NoNewWindow `
        -PassThru
    $script:lastRestartAt = Get-Date
    $script:backendExitNoticeShown = $false
}

function Start-FrontendProcess {
    Stop-FrontendProcess

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting frontend dev server..."
    $script:frontendProcess = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $webDir `
        -NoNewWindow `
        -PassThru
}

function Request-BackendRestart {
    param(
        [string]$ChangedPath
    )

    if ([string]::IsNullOrWhiteSpace($ChangedPath)) {
        return
    }

    $normalizedPath = $ChangedPath.Replace("/", "\")
    if (
        $normalizedPath -match "\\tmp\\" -or
        $normalizedPath -match "\\dist\\" -or
        $normalizedPath -match "\\node_modules\\"
    ) {
        return
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Change detected: $normalizedPath"
    $script:changePending = $true
}

function Add-BackendWatcher {
    param(
        [string]$Path,
        [string]$Filter,
        [bool]$IncludeSubdirectories
    )

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $Path
    $watcher.Filter = $Filter
    $watcher.IncludeSubdirectories = $IncludeSubdirectories
    $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, CreationTime, Size'
    $watcher.EnableRaisingEvents = $true

    $script:watchers += $watcher
    $script:subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Changed -Action { Request-BackendRestart $Event.SourceEventArgs.FullPath }
    $script:subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Created -Action { Request-BackendRestart $Event.SourceEventArgs.FullPath }
    $script:subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action { Request-BackendRestart $Event.SourceEventArgs.FullPath }
    $script:subscriptions += Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action { Request-BackendRestart $Event.SourceEventArgs.FullPath }
}

try {
    try {
        $Host.UI.RawUI.WindowTitle = "MediaVault Dev"
    } catch {
    }

    Write-Host ""
    Write-Host "Repo Root : $repoRoot"
    Write-Host "App Dir   : $appDir"
    Write-Host "Web Dir   : $webDir"
    Write-Host ""

    Stop-StaleDevSessions `
        -BackendTitle $backendWindowTitle `
        -FrontendTitle $frontendWindowTitle `
        -WebPath $webDir

    if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
        Write-Host "Installing frontend dependencies..."
        Push-Location $webDir
        try {
            npm install
        } finally {
            Pop-Location
        }
    }

    Add-BackendWatcher -Path $appDir -Filter "*.go" -IncludeSubdirectories $true
    Add-BackendWatcher -Path $appDir -Filter "go.mod" -IncludeSubdirectories $false

    if (Test-Path (Join-Path $appDir "go.sum")) {
        Add-BackendWatcher -Path $appDir -Filter "go.sum" -IncludeSubdirectories $false
    }

    Start-BackendProcess
    Start-FrontendProcess

    Write-Host ""
    Write-Host "MediaVault dev mode is running in this window."
    Write-Host "Backend changes restart automatically. Press Ctrl+C to stop everything."

    while ($true) {
        Start-Sleep -Milliseconds 250

        if ($script:backendProcess -and $script:backendProcess.HasExited) {
            if (-not $script:backendExitNoticeShown) {
                Write-Warning "Backend process exited. Save a Go file to restart it."
                $script:backendExitNoticeShown = $true
            }
            $script:backendProcess = $null
        }

        if ($script:frontendProcess -and $script:frontendProcess.HasExited) {
            throw "Frontend dev server exited."
        }

        if (-not $script:changePending) {
            continue
        }

        if (((Get-Date) - $script:lastRestartAt) -lt $script:debounceWindow) {
            continue
        }

        $script:changePending = $false
        Start-BackendProcess
    }
} finally {
    foreach ($subscription in $script:subscriptions) {
        try {
            Unregister-Event -SubscriptionId $subscription.Id
        } catch {
        }
    }

    foreach ($watcher in $script:watchers) {
        try {
            $watcher.EnableRaisingEvents = $false
            $watcher.Dispose()
        } catch {
        }
    }

    Stop-BackendProcess
    Stop-FrontendProcess
}
