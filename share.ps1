# Share DOC with friends anywhere using a free Cloudflare quick tunnel.
# Usage: .\share.ps1     (keep this window open; press Ctrl+C to stop sharing)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$exe = @("C:\Program Files (x86)\cloudflared\cloudflared.exe", "C:\Program Files\cloudflared\cloudflared.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Host "Installing cloudflared..."; winget install --id Cloudflare.cloudflared --exact --accept-source-agreements --accept-package-agreements --silent; $exe = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }

try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health -TimeoutSec 2 | Out-Null }
catch {
    Write-Host "DOC is not running, starting it in a new window..." -ForegroundColor Yellow
    Start-Process pwsh -ArgumentList "-NoProfile", "-File", "$PSScriptRoot\start.ps1" -WorkingDirectory $PSScriptRoot
    Start-Sleep 12
}
Write-Host "Creating your public link (look for https://....trycloudflare.com below)..." -ForegroundColor Green
Write-Host "Send that link to your friends. They should click 'Try the live demo'. Ctrl+C stops sharing." -ForegroundColor Green
& $exe tunnel --no-autoupdate --url http://127.0.0.1:8000
