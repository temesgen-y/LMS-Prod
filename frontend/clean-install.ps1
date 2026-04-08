# Fix "next-flight-client-entry-loader" / build errors
# 1. Stop dev server (Ctrl+C), then run: .\clean-install.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Clearing npm cache..." -ForegroundColor Yellow
npm cache clean --force

Write-Host "Removing node_modules, .next, package-lock.json..." -ForegroundColor Yellow
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json }

Write-Host "Installing dependencies (Next 15.1.0)..." -ForegroundColor Yellow
npm install

Write-Host "Done. Run: npm run dev" -ForegroundColor Green
