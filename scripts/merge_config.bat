@echo off
setlocal EnableExtensions

echo.
echo ==========================================
echo   MediaVault Config Merge Tool
echo ==========================================
echo.
echo Rule:
echo   - Old config values are preserved
echo   - New config keys/objects are added
echo   - Existing settings are not overwritten
echo.

REM ------------------------------------------------------------
REM Read arguments or ask interactively
REM ------------------------------------------------------------

set "OLD_CONFIG=%~1"
set "NEW_CONFIG=%~2"
set "OUTPUT_CONFIG=%~3"

if "%OLD_CONFIG%"=="" (
    set /p "OLD_CONFIG=Enter OLD config path: "
)

if "%NEW_CONFIG%"=="" (
    set /p "NEW_CONFIG=Enter NEW config path: "
)

if "%OUTPUT_CONFIG%"=="" (
    set /p "OUTPUT_CONFIG=Enter OUTPUT merged config path: "
)

REM Remove accidental surrounding quotes from interactive input
set "OLD_CONFIG=%OLD_CONFIG:"=%"
set "NEW_CONFIG=%NEW_CONFIG:"=%"
set "OUTPUT_CONFIG=%OUTPUT_CONFIG:"=%"

echo.
echo Old config:
echo   %OLD_CONFIG%
echo.
echo New config:
echo   %NEW_CONFIG%
echo.
echo Output config:
echo   %OUTPUT_CONFIG%
echo.

REM ------------------------------------------------------------
REM Validate files
REM ------------------------------------------------------------

if not exist "%OLD_CONFIG%" (
    echo ERROR: Old config file not found:
    echo %OLD_CONFIG%
    exit /b 1
)

if not exist "%NEW_CONFIG%" (
    echo ERROR: New config file not found:
    echo %NEW_CONFIG%
    exit /b 1
)

for %%I in ("%OUTPUT_CONFIG%") do set "OUTPUT_DIR=%%~dpI"

if not exist "%OUTPUT_DIR%" (
    echo ERROR: Output directory does not exist:
    echo %OUTPUT_DIR%
    exit /b 1
)

REM ------------------------------------------------------------
REM Create temporary PowerShell script
REM ------------------------------------------------------------

set "TEMP_PS1=%TEMP%\merge_config_%RANDOM%%RANDOM%.ps1"

> "%TEMP_PS1%" (
    echo param(
    echo     [string]$OldPath,
    echo     [string]$NewPath,
    echo     [string]$OutPath
    echo ^)
    echo.
    echo $ErrorActionPreference = "Stop"
    echo.
    echo function Is-JsonObject($value^) {
    echo     return $null -ne $value -and $value.GetType(^).Name -eq "PSCustomObject"
    echo }
    echo.
    echo function Has-Property($obj, [string]$name^) {
    echo     if (-not (Is-JsonObject $obj^)^) { return $false }
    echo     return $obj.PSObject.Properties.Name -contains $name
    echo }
    echo.
    echo function Convert-ToComparableJson($value^) {
    echo     return ($value ^| ConvertTo-Json -Depth 100 -Compress^)
    echo }
    echo.
    echo function Merge-Config($old, $new^) {
    echo.
    echo     if ($null -eq $old^) {
    echo         return $new
    echo     }
    echo.
    echo     if ($null -eq $new^) {
    echo         return $old
    echo     }
    echo.
    echo     if ((Is-JsonObject $old^) -and (Is-JsonObject $new^)^) {
    echo         $result = [ordered]@{}
    echo.
    echo         foreach ($prop in $old.PSObject.Properties^) {
    echo             $result[$prop.Name] = $prop.Value
    echo         }
    echo.
    echo         foreach ($prop in $new.PSObject.Properties^) {
    echo             if ($result.Contains($prop.Name^)^) {
    echo                 $result[$prop.Name] = Merge-Config $result[$prop.Name] $prop.Value
    echo             } else {
    echo                 $result[$prop.Name] = $prop.Value
    echo             }
    echo         }
    echo.
    echo         return [pscustomobject]$result
    echo     }
    echo.
    echo     if (($old -is [array]^) -and ($new -is [array]^)^) {
    echo         return Merge-List $old $new
    echo     }
    echo.
    echo     # Primitive value or type mismatch:
    echo     # old config wins
    echo     return $old
    echo }
    echo.
    echo function Merge-List($oldList, $newList^) {
    echo     $merged = New-Object System.Collections.ArrayList
    echo.
    echo     foreach ($item in $oldList^) {
    echo         [void]$merged.Add($item^)
    echo     }
    echo.
    echo     foreach ($newItem in $newList^) {
    echo         $handled = $false
    echo.
    echo         if (Is-JsonObject $newItem^) {
    echo             $matchKey = $null
    echo.
    echo             foreach ($key in @("id", "name", "key", "type"^)^) {
    echo                 if (Has-Property $newItem $key^) {
    echo                     $matchKey = $key
    echo                     break
    echo                 }
    echo             }
    echo.
    echo             if ($matchKey^) {
    echo                 for ($i = 0; $i -lt $merged.Count; $i++^) {
    echo                     $oldItem = $merged[$i]
    echo.
    echo                     if ((Is-JsonObject $oldItem^) -and (Has-Property $oldItem $matchKey^)^) {
    echo                         if ($oldItem.$matchKey -eq $newItem.$matchKey^) {
    echo                             $merged[$i] = Merge-Config $oldItem $newItem
    echo                             $handled = $true
    echo                             break
    echo                         }
    echo                     }
    echo                 }
    echo             }
    echo         }
    echo.
    echo         if (-not $handled^) {
    echo             $exists = $false
    echo             $newJson = Convert-ToComparableJson $newItem
    echo.
    echo             foreach ($existing in $merged^) {
    echo                 $existingJson = Convert-ToComparableJson $existing
    echo.
    echo                 if ($existingJson -eq $newJson^) {
    echo                     $exists = $true
    echo                     break
    echo                 }
    echo             }
    echo.
    echo             if (-not $exists^) {
    echo                 [void]$merged.Add($newItem^)
    echo             }
    echo         }
    echo     }
    echo.
    echo     return @($merged^)
    echo }
    echo.
    echo if (-not (Test-Path -LiteralPath $OldPath^)^) {
    echo     throw "Old config not found: $OldPath"
    echo }
    echo.
    echo if (-not (Test-Path -LiteralPath $NewPath^)^) {
    echo     throw "New config not found: $NewPath"
    echo }
    echo.
    echo $oldRaw = Get-Content -LiteralPath $OldPath -Raw
    echo $newRaw = Get-Content -LiteralPath $NewPath -Raw
    echo.
    echo $oldConfig = $oldRaw ^| ConvertFrom-Json
    echo $newConfig = $newRaw ^| ConvertFrom-Json
    echo.
    echo $merged = Merge-Config $oldConfig $newConfig
    echo.
    echo $mergedJson = $merged ^| ConvertTo-Json -Depth 100
    echo.
    echo $outputParent = Split-Path -Parent $OutPath
    echo if ($outputParent -and -not (Test-Path -LiteralPath $outputParent^)^) {
    echo     throw "Output directory does not exist: $outputParent"
    echo }
    echo.
    echo Set-Content -LiteralPath $OutPath -Value $mergedJson -Encoding UTF8
    echo.
    echo Write-Host "Merged config written to: $OutPath"
)

REM ------------------------------------------------------------
REM Run PowerShell script
REM ------------------------------------------------------------

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TEMP_PS1%" -OldPath "%OLD_CONFIG%" -NewPath "%NEW_CONFIG%" -OutPath "%OUTPUT_CONFIG%"

set "PS_EXIT_CODE=%ERRORLEVEL%"

REM ------------------------------------------------------------
REM Cleanup
REM ------------------------------------------------------------

if exist "%TEMP_PS1%" del "%TEMP_PS1%" >nul 2>&1

if not "%PS_EXIT_CODE%"=="0" (
    echo.
    echo Merge failed.
    exit /b %PS_EXIT_CODE%
)

echo.
echo Done.
exit /b 0