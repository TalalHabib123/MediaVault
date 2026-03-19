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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path
$appDir    = Join-Path $repoRoot "app"
$webDir    = Join-Path $appDir "web"

$goModPath      = Join-Path $appDir "go.mod"
$packageJson    = Join-Path $webDir "package.json"

Require-Path $appDir "Missing app folder: $appDir"
Require-Path $webDir "Missing web folder: $webDir"
Require-Path $goModPath "Missing go.mod at: $goModPath"
Require-Path $packageJson "Missing package.json at: $packageJson"

Write-Host ""
Write-Host "Repo Root : $repoRoot"
Write-Host "App Dir   : $appDir"
Write-Host "Web Dir   : $webDir"
Write-Host ""

# Frontend deps
if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $webDir
    npm install
    Pop-Location
}

Write-Host "Starting backend..."
Start-Process powershell `
    -WorkingDirectory $appDir `
    -ArgumentList @(
        "-NoExit",
        "-Command",
        "go mod tidy; go run ./cmd/server"
    )

Write-Host "Starting frontend..."
Start-Process powershell `
    -WorkingDirectory $webDir `
    -ArgumentList @(
        "-NoExit",
        "-Command",
        "npm run dev"
    )

Write-Host ""
Write-Host "Backend and frontend launched in separate windows."