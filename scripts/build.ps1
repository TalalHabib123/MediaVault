$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
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
    "host": "127.0.0.1",
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
  }
}
'@

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $BundleConfigDir "config.json"), $ConfigJson, $Utf8NoBom)

Write-Step "Creating start script"
$StartBat = @'
@echo off
setlocal
cd /d "%~dp0"

start "MediaVault" "%~dp0MediaVault.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='http://127.0.0.1:5000/api/health';" ^
  "$ok=$false;" ^
  "1..40 | ForEach-Object { try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Milliseconds 500 } };" ^
  "Start-Process 'http://127.0.0.1:5000';"

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
'@
Set-Content -Path (Join-Path $BundleDir "README-First-Run.txt") -Value $Readme -Encoding UTF8

Write-Step "Release ready"
Write-Host "Bundle created at:" -ForegroundColor Green
Write-Host $BundleDir -ForegroundColor Yellow