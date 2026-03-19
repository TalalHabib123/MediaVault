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
$outputExe      = Join-Path $repoRoot "MediaVault.exe"

Require-Path $appDir "Missing app folder: $appDir"
Require-Path $webDir "Missing web folder: $webDir"
Require-Path $goModPath "Missing go.mod at: $goModPath"
Require-Path $packageJson "Missing package.json at: $packageJson"

# Ensure portable runtime folders exist
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "bin")    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "data")   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "logs")   | Out-Null

Write-Host ""
Write-Host "Repo Root : $repoRoot"
Write-Host "App Dir   : $appDir"
Write-Host "Web Dir   : $webDir"
Write-Host ""

Write-Host "Installing frontend dependencies if needed..."
Push-Location $webDir
if (-not (Test-Path "node_modules")) {
    npm install
}
npm run build
Pop-Location

Write-Host "Building backend..."
Push-Location $appDir
go mod tidy
go build -o $outputExe ./cmd/server
Pop-Location

Write-Host ""
Write-Host "Build complete:"
Write-Host $outputExe