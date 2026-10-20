# Optional one-command publish from the extracted public project folder.
# Prerequisites: Git for Windows + GitHub CLI (`gh`). You will authenticate in your own browser.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows first: https://git-scm.com/download/win' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI first: https://cli.github.com/' }
& python scripts/check_public_safe.py
if ($LASTEXITCODE -ne 0) { throw 'Safety scan failed; do not publish these files.' }
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { gh auth login --web }
& gh repo view 'ShinyShinChan/FrameLounge-FireTV' *> $null
if ($LASTEXITCODE -eq 0) { throw 'FrameLounge-FireTV already exists. Open it on GitHub instead of creating a duplicate.' }
if (-not (Test-Path '.git')) { git init -b main }
git add .
git commit -m 'Initial public Frame Lounge Fire TV app' 2>$null
& gh repo create 'ShinyShinChan/FrameLounge-FireTV' --public --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'GitHub publish did not succeed; inspect the output.' }
Write-Host 'Project uploaded! Open https://github.com/ShinyShinChan/FrameLounge-FireTV/actions to find the APK build.'
