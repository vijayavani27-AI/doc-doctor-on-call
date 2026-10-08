# Windows one-click start: builds the frontend if needed and runs DOC.
# Usage:  .\start.ps1            (default port 8000)
#         .\start.ps1 -Port 8080
#         .\start.ps1 -Lan          (also reachable from your phone on the same Wi-Fi)
param([int]$Port = 8000, [switch]$Lan)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Test-DOC([int]$p) {
    try { (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$p/api/health" -TimeoutSec 2).Content -match '"status":"ok"' } catch { $false }
}
function Test-PortBusy([int]$p) {
    [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

# Already running? Just open it.
if (Test-DOC $Port) {
    Write-Host "DOC is already running -> http://127.0.0.1:$Port" -ForegroundColor Green
    Start-Process "http://127.0.0.1:$Port"
    exit 0
}
# Port taken by something else? Move to the next free port.
while (Test-PortBusy $Port) {
    Write-Host "Port $Port is in use by another program, trying $($Port + 1)..." -ForegroundColor Yellow
    $Port++
}

if (-not (Test-Path "backend\.venv\Scripts\python.exe")) { python -m venv backend\.venv }
& backend\.venv\Scripts\python.exe -m pip install -q --disable-pip-version-check -r backend\requirements.txt
if (-not (Test-Path "frontend\dist\index.html")) { Push-Location frontend; npm install; npm run build; Pop-Location }

$url = "http://127.0.0.1:$Port"
$bind = "127.0.0.1"
if ($Lan) {
    $bind = "0.0.0.0"
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
    if ($ip) { Write-Host "On your phone (same Wi-Fi) open: http://${ip}:$Port" -ForegroundColor Cyan }
}
Write-Host ""
Write-Host "DOC starting -> $url   (press Ctrl+C to stop)" -ForegroundColor Green
Write-Host "Demo login: click 'Try the live demo'" -ForegroundColor Green
Start-Job -ScriptBlock { param($u) Start-Sleep 3; Start-Process $u } -ArgumentList $url | Out-Null
& backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host $bind --port $Port
