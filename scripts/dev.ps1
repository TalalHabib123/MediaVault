param(
    [ValidateSet("", "local", "lan")]
    [string]$AccessMode = "",
    [switch]$ResetAuth
)

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

function Read-AccessMode {
    param(
        [string]$CurrentMode
    )

    if ($CurrentMode) {
        return $CurrentMode
    }

    Write-Host ""
    Write-Host "Select MediaVault access mode:"
    Write-Host "  1) Local only (localhost)"
    Write-Host "  2) LAN mode (0.0.0.0, requires owner setup)"
    $answer = Read-Host "Mode [1]"
    if ($answer -eq "2" -or $answer.Trim().ToLowerInvariant() -eq "lan") {
        return "lan"
    }
    return "local"
}

function Get-LanIpCandidates {
    $addresses = @()
    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.PrefixOrigin -ne "WellKnown"
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    } catch {
        $addresses = @()
    }

    return @($addresses)
}

function Sync-EmbeddedWebDist {
    param(
        [string]$WebPath,
        [string]$EmbedPath
    )

    Write-Host "Building embedded frontend snapshot for http://localhost:5000..."
    Push-Location $WebPath
    try {
        npm run build
    } finally {
        Pop-Location
    }

    if (Test-Path $EmbedPath) {
        Remove-Item $EmbedPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $EmbedPath | Out-Null
    Copy-Item (Join-Path $WebPath "dist\*") $EmbedPath -Recurse -Force
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
$embedDistDir = Join-Path $appDir "internal\webui\dist"

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
$script:accessMode = Read-AccessMode -CurrentMode $AccessMode
$script:resetAuthPending = [bool]$ResetAuth

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
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting backend server ($script:accessMode mode)..."
    $env:MEDIAVAULT_ACCESS_MODE = $script:accessMode
    if ($script:resetAuthPending) {
        $env:MEDIAVAULT_AUTH_RESET = "1"
        $script:resetAuthPending = $false
    } else {
        Remove-Item Env:\MEDIAVAULT_AUTH_RESET -ErrorAction SilentlyContinue
    }
    $script:backendProcess = Start-Process `
        -FilePath "go" `
        -ArgumentList @("run", "./cmd/server") `
        -WorkingDirectory $appDir `
        -NoNewWindow `
        -PassThru
    Remove-Item Env:\MEDIAVAULT_AUTH_RESET -ErrorAction SilentlyContinue
    $script:lastRestartAt = Get-Date
    $script:backendExitNoticeShown = $false
}

function Start-FrontendProcess {
    Stop-FrontendProcess

    $webHost = "localhost"
    if ($script:accessMode -eq "lan") {
        $webHost = "0.0.0.0"
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting frontend dev server ($webHost)..."
    $env:MEDIAVAULT_WEB_HOST = $webHost
    $env:MEDIAVAULT_API_TARGET = "http://localhost:5000"
    $script:frontendProcess = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $webDir `
        -NoNewWindow `
        -PassThru
    Remove-Item Env:\MEDIAVAULT_WEB_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\MEDIAVAULT_API_TARGET -ErrorAction SilentlyContinue
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

    Sync-EmbeddedWebDist -WebPath $webDir -EmbedPath $embedDistDir

    Add-BackendWatcher -Path $appDir -Filter "*.go" -IncludeSubdirectories $true
    Add-BackendWatcher -Path $appDir -Filter "go.mod" -IncludeSubdirectories $false

    if (Test-Path (Join-Path $appDir "go.sum")) {
        Add-BackendWatcher -Path $appDir -Filter "go.sum" -IncludeSubdirectories $false
    }

    Start-BackendProcess
    Start-FrontendProcess

    Write-Host ""
    Write-Host "MediaVault dev mode is running in this window."
    Write-Host "Local UI: http://localhost:5173"
    Write-Host "Embedded UI/API: http://localhost:5000"
    if ($script:accessMode -eq "lan") {
        $lanIps = Get-LanIpCandidates
        foreach ($lanIp in $lanIps) {
            Write-Host "LAN UI: http://$($lanIp):5173"
            Write-Host "LAN embedded UI/API: http://$($lanIp):5000"
        }
    }
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
