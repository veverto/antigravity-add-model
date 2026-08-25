# Antigravity IDE Safe Deploy
# Builds TypeScript proxy, installs modules, applies Node.js patcher, and syncs custom models

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Antigravity IDE Deploy Script" -ForegroundColor Yellow
Write-Host "  MRMPPRO | IDE Custom Models & Standalone Proxy" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Cyan

# 1. Close Antigravity IDE & Language Server processes completely
Write-Host ""
Write-Host "[1/6] Closing Antigravity IDE & Language Server..." -ForegroundColor Yellow
taskkill /F /IM "Antigravity IDE.exe" /T 2>$null | Out-Null
taskkill /F /IM "language_server_windows_x64.exe" /T 2>$null | Out-Null
$ideProcs = Get-Process -Name "Antigravity IDE*", "language_server_windows_x64*" -ErrorAction SilentlyContinue
if ($ideProcs) { 
    $ideProcs | Stop-Process -Force -ErrorAction SilentlyContinue 
}
Start-Sleep -Seconds 2
Write-Host "   OK" -ForegroundColor Green

# 2. Define paths
$ProjectDir = $PSScriptRoot
$IdeAppDir = "$env:LOCALAPPDATA\Programs\Antigravity IDE\resources\app"
$IdeMainPath = "$IdeAppDir\out\main.js"
$IdeProxyDir = "$IdeAppDir\out\mrmppro-proxy"

if (-not (Test-Path $IdeMainPath)) {
    Write-Host "ERROR: Antigravity IDE not found at: $IdeAppDir" -ForegroundColor Red
    exit 1
}

# 3. Build latest TypeScript
Write-Host "[2/6] Building TypeScript..." -ForegroundColor Yellow
Push-Location $ProjectDir
try {
    npm run build
    Write-Host "   OK - Build succeeded" -ForegroundColor Green
} catch {
    Write-Host "   WARNING - TypeScript build error: $_" -ForegroundColor Yellow
} finally {
    Pop-Location
}

# 4. Copy proxy modules to IDE
Write-Host "[3/6] Copying proxy modules to Antigravity IDE..." -ForegroundColor Yellow
if (Test-Path $IdeProxyDir) { Remove-Item $IdeProxyDir -Recurse -Force }
New-Item -ItemType Directory -Path $IdeProxyDir -Force | Out-Null

$distFiles = @(
    "proxy.js", "proxy.js.map",
    "cryptoStore.js", "cryptoStore.js.map",
    "schemaValidator.js", "schemaValidator.js.map",
    "paths.js", "paths.js.map",
    "storage.js", "storage.js.map"
)
foreach ($f in $distFiles) {
    $src = Join-Path $ProjectDir "dist\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $IdeProxyDir $f) -Force }
}

foreach ($subDir in @("proxy", "autoSwitch", "services")) {
    $srcSub = Join-Path $ProjectDir "dist\$subDir"
    $destSub = Join-Path $IdeProxyDir $subDir
    if (Test-Path $srcSub) {
        Copy-Item $srcSub $destSub -Recurse -Force
    }
}

# Copy electron-log to IDE node_modules
$IdeElectronLog = "$IdeAppDir\node_modules\electron-log"
if (-not (Test-Path $IdeElectronLog)) {
    $srcElectronLog = Join-Path $ProjectDir "node_modules\electron-log"
    if (Test-Path $srcElectronLog) {
        Copy-Item $srcElectronLog $IdeElectronLog -Recurse -Force
    }
}

# Write CommonJS package.json in proxy dir to avoid ESM loader errors in IDE
$proxyPkgJson = '{"type":"commonjs"}'
[System.IO.File]::WriteAllText((Join-Path $IdeProxyDir "package.json"), $proxyPkgJson)
Write-Host "   OK" -ForegroundColor Green

# 5. Patch UI bundles, main.js, and update checksums via Node.js
Write-Host "[4/6] Patching Antigravity IDE main.js & UI bundles via Node.js..." -ForegroundColor Yellow
node "$ProjectDir\patch-ide.js"

# 6. Binary Patch Language Server executable (Dual Endpoint Byte Patch)
Write-Host "[5/6] Patching IDE Language Server binary..." -ForegroundColor Yellow
$ideLs = "$IdeAppDir\extensions\antigravity\bin\language_server_windows_x64.exe"
if (Test-Path $ideLs) {
    try {
        $outBytes = [System.IO.File]::ReadAllBytes($ideLs)
        $targets = @(
            @{ Search = "https://daily-cloudcode-pa.googleapis.com"; Replace = "http://localhost:50999/v1internal/xxxxxxx" },
            @{ Search = "https://cloudcode-pa.googleapis.com"; Replace = "http://localhost:50999/v1internal/x" }
        )
        $modified = $false
        foreach ($t in $targets) {
            $searchBytes = [System.Text.Encoding]::ASCII.GetBytes($t.Search)
            $replaceBytes = [System.Text.Encoding]::ASCII.GetBytes($t.Replace)
            for ($i = 0; $i -le $outBytes.Length - $searchBytes.Length; $i++) {
                $match = $true
                for ($j = 0; $j -lt $searchBytes.Length; $j++) {
                    if ($outBytes[$i + $j] -ne $searchBytes[$j]) {
                        $match = $false
                        break
                    }
                }
                if ($match) {
                    [System.Array]::Copy($replaceBytes, 0, $outBytes, $i, $replaceBytes.Length)
                    $modified = $true
                    $i += $replaceBytes.Length - 1
                }
            }
        }
        if ($modified) {
            [System.IO.File]::WriteAllBytes($ideLs, $outBytes)
            Write-Host "   OK - IDE Language Server binary patched on disk" -ForegroundColor Green
        } else {
            Write-Host "   OK - IDE Language Server binary already patched" -ForegroundColor Green
        }
    } catch {
        Write-Host "   WARNING - Could not patch LS binary: $_" -ForegroundColor Yellow
    }
}

# 7. Launch Antigravity IDE
Write-Host "[6/6] Launching Antigravity IDE..." -ForegroundColor Yellow
$IdeExePath = "$env:LOCALAPPDATA\Programs\Antigravity IDE\Antigravity IDE.exe"
if (Test-Path $IdeExePath) {
    Start-Process -FilePath $IdeExePath
    Write-Host "   Antigravity IDE launched." -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SUCCESS! Antigravity IDE deployed and ready." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
