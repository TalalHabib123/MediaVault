param(
    [ValidateSet("", "local", "lan")]
    [string]$DefaultAccessMode = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Read-AccessMode {
    param(
        [string]$CurrentMode
    )

    if ($CurrentMode) {
        return $CurrentMode
    }

    Write-Host ""
    Write-Host "Select the default access mode for the portable launcher:"
    Write-Host "  1) Local only (localhost)"
    Write-Host "  2) LAN mode prompt default (0.0.0.0 after owner setup)"
    $answer = Read-Host "Mode [1]"
    if ($answer -eq "2" -or $answer.Trim().ToLowerInvariant() -eq "lan") {
        return "lan"
    }
    return "local"
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$AppDir = Join-Path $RepoRoot "app"
$WebDir = Join-Path $AppDir "web"
$EmbedDistDir = Join-Path $AppDir "internal\webui\dist"

$ReleaseRoot = Join-Path $RepoRoot "release"
$BundleDir = Join-Path $ReleaseRoot "MediaVault"

$BundleBinDir = Join-Path $BundleDir "bin"
$BundleConfigDir = Join-Path $BundleDir "config"
$BundleDataDir = Join-Path $BundleDir "data"
$BundleLogsDir = Join-Path $BundleDir "logs"

$RepoBinDir = Join-Path $RepoRoot "bin"
$FFmpegExe = Join-Path $RepoBinDir "ffmpeg.exe"
$FFprobeExe = Join-Path $RepoBinDir "ffprobe.exe"
$DefaultAccessMode = Read-AccessMode -CurrentMode $DefaultAccessMode

if (-not (Test-Path $FFmpegExe)) {
    throw "ffmpeg.exe not found at: $FFmpegExe"
}

if (-not (Test-Path $FFprobeExe)) {
    throw "ffprobe.exe not found at: $FFprobeExe"
}

Write-Step "Cleaning old release bundle"
if (Test-Path $BundleDir) {
    Remove-Item $BundleDir -Recurse -Force
}

New-Item -ItemType Directory -Path $BundleDir | Out-Null
New-Item -ItemType Directory -Path $BundleBinDir | Out-Null
New-Item -ItemType Directory -Path $BundleConfigDir | Out-Null
New-Item -ItemType Directory -Path $BundleDataDir | Out-Null
New-Item -ItemType Directory -Path $BundleLogsDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BundleDataDir "previews") | Out-Null

Write-Step "Building frontend"
Push-Location $WebDir
try {
    if (Test-Path "package-lock.json") {
        npm ci
    }
    else {
        npm install
    }

    npm run build
}
finally {
    Pop-Location
}

Write-Step "Refreshing embedded web dist"
if (Test-Path $EmbedDistDir) {
    Remove-Item $EmbedDistDir -Recurse -Force
}
New-Item -ItemType Directory -Path $EmbedDistDir | Out-Null
Copy-Item (Join-Path $WebDir "dist\*") $EmbedDistDir -Recurse -Force

Write-Step "Building MediaVault.exe"
$OutputExe = Join-Path $BundleDir "MediaVault.exe"

Push-Location $AppDir
try {
    $env:CGO_ENABLED = "0"
    go mod tidy
    go build -trimpath -ldflags "-s -w" -o $OutputExe ./cmd/server
}
finally {
    Pop-Location
}

Write-Step "Copying ffmpeg tools"
Copy-Item $FFmpegExe (Join-Path $BundleBinDir "ffmpeg.exe") -Force
Copy-Item $FFprobeExe (Join-Path $BundleBinDir "ffprobe.exe") -Force

Write-Step "Writing clean portable config"
$ConfigJson = @'
{
  "server": {
    "host": "localhost",
    "port": 5000
  },
  "paths": {
    "sources": [],
    "library_root": "",
    "views_root": "",
    "preview_cache": "./data/previews"
  },
  "tools": {
    "ffmpeg": "./bin/ffmpeg.exe",
    "ffprobe": "./bin/ffprobe.exe",
    "vlc": ""
  },
  "mode": {
    "portable": true
  },
  "security": {
    "auth_enabled": true,
    "lan_enabled": false,
    "bind_host": "localhost",
    "allowed_origins": [],
    "session_idle_minutes": 720,
    "remembered_device_days": 30,
    "failed_login_limit": 5
  }
}
'@

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $BundleConfigDir "config.json"), $ConfigJson, $Utf8NoBom)

Write-Step "Creating start scripts"
$StartPs1 = @'
$ErrorActionPreference = "Stop"

$Port = __PORT__
$DefaultMode = "__DEFAULT_ACCESS_MODE__"

function Read-AccessMode {
    param(
        [string]$DefaultMode
    )

    Write-Host ""
    Write-Host "Select MediaVault access mode:"
    Write-Host "  1) Local only (localhost)"
    Write-Host "  2) LAN mode (0.0.0.0 after owner setup)"
    $answer = Read-Host "Mode [$DefaultMode]"

    if ([string]::IsNullOrWhiteSpace($answer)) {
        $answer = $DefaultMode
    }

    $answer = $answer.Trim().ToLowerInvariant()
    if ($answer -eq "2" -or $answer -eq "lan") {
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
        try {
            $addresses = [System.Net.Dns]::GetHostEntry([System.Net.Dns]::GetHostName()).AddressList |
                Where-Object {
                    $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                    $_.ToString() -notlike "127.*" -and
                    $_.ToString() -notlike "169.254.*"
                } |
                ForEach-Object { $_.ToString() } |
                Sort-Object -Unique
        } catch {
            $addresses = @()
        }
    }

    return @($addresses)
}

function Wait-ForServer {
    param(
        [string]$HealthUrl
    )

    for ($i = 0; $i -lt 40; $i++) {
        try {
            Invoke-WebRequest -UseBasicParsing $HealthUrl -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    return $false
}

$mode = Read-AccessMode -DefaultMode $DefaultMode
$exePath = Join-Path $PSScriptRoot "MediaVault.exe"
$hostUrl = "http://localhost:$Port"
$healthUrl = "$hostUrl/api/health"

if (-not (Test-Path $exePath)) {
    throw "MediaVault.exe not found at: $exePath"
}

$env:MEDIAVAULT_ACCESS_MODE = $mode

try {
    Write-Host ""
    Write-Host "Starting MediaVault in $mode mode..."
    Write-Host "Host URL: $hostUrl"
    if ($mode -eq "lan") {
        Write-Host "LAN mode requested. Waiting for MediaVault to confirm the actual mode..."
    }

    Start-Process -FilePath $exePath -WorkingDirectory $PSScriptRoot | Out-Null

    $serverReady = Wait-ForServer -HealthUrl $healthUrl
    if (-not $serverReady) {
        Write-Warning "MediaVault did not answer the health check yet. Check the MediaVault window for startup errors."
    }

    $status = $null
    if ($serverReady) {
        try {
            $status = Invoke-RestMethod -Uri "$hostUrl/api/auth/status" -TimeoutSec 2
        } catch {
            $status = $null
        }
    }

    if ($mode -eq "lan") {
        if ($status -and $status.lan_enabled) {
            $lanIps = Get-LanIpCandidates
            if ($lanIps.Count -eq 0) {
                Write-Warning "LAN mode is active, but no LAN IPv4 address was detected. Run ipconfig and use this PC's IPv4 address with port $Port."
            } else {
                foreach ($lanIp in $lanIps) {
                    Write-Host "LAN URL: http://$($lanIp):$Port"
                }
            }
        } else {
            Write-Warning "LAN mode was selected, but MediaVault is still local. Finish owner setup at $hostUrl, then close MediaVault and start it again in LAN mode."
        }
    }

    Start-Process $hostUrl

    if ($mode -eq "lan") {
        Write-Host ""
        Write-Host "Keep this launcher window open if you want to copy the LAN URL."
        [void](Read-Host "Press Enter to close this launcher window")
    }
} finally {
    Remove-Item Env:\MEDIAVAULT_ACCESS_MODE -ErrorAction SilentlyContinue
}
'@
$StartPs1 = $StartPs1.Replace("__DEFAULT_ACCESS_MODE__", $DefaultAccessMode)
$StartPs1 = $StartPs1.Replace("__PORT__", "5000")
Set-Content -Path (Join-Path $BundleDir "Start-MediaVault.ps1") -Value $StartPs1 -Encoding ASCII

$StartBat = @'
@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MediaVault.ps1"
if errorlevel 1 pause

endlocal
'@
Set-Content -Path (Join-Path $BundleDir "Start-MediaVault.bat") -Value $StartBat -Encoding ASCII

Write-Step "Creating optional stop script"
$StopBat = @'
@echo off
taskkill /FI "IMAGENAME eq MediaVault.exe" /F
'@
Set-Content -Path (Join-Path $BundleDir "Stop-MediaVault.bat") -Value $StopBat -Encoding ASCII

Write-Step "Creating first-run note"
$Readme = @'
MediaVault Portable Release

How to use on a new Windows laptop:
1. Copy the entire "MediaVault" folder to the new laptop.
2. Double-click "Start-MediaVault.bat".
3. Browser will open automatically.
4. Go to Settings and configure:
   - Source folders
   - Library root
   - Optional VLC path
5. Save settings.

Notes:
- This release is portable and keeps its own config/data/logs beside the exe.
- No Go or Node is needed on the target laptop.
- ffmpeg and ffprobe are already bundled.
- VLC is optional and must be installed separately if you want the VLC button.
- LAN mode prints the LAN URL in the launcher and the MediaVault server window.
- On first run, finish owner setup locally, then restart in LAN mode.
'@
Set-Content -Path (Join-Path $BundleDir "README-First-Run.txt") -Value $Readme -Encoding UTF8

Write-Step "Release ready"
Write-Host "Bundle created at:" -ForegroundColor Green
Write-Host $BundleDir -ForegroundColor Yellow
