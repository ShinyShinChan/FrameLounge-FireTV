# Updates your existing FrameLounge-FireTV PUBLIC GitHub repository without creating a new repository.
# Requires Git for Windows (https://git-scm.com/downloads/win), GitHub CLI (https://cli.github.com), Python 3.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
foreach ($cmd in @('git','gh','python')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Missing '$cmd'. Please install it first." }
}
& python scripts/check_public_safe.py
if ($LASTEXITCODE -ne 0) { throw 'Source contains apparent credentials. Refusing public upload.' }
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { & gh auth login --web; if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in failed.' } }
& gh auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'GitHub Git authentication setup failed.' }
$folder = Join-Path ([System.IO.Path]::GetTempPath()) ('FrameLoungeUpdate-' + [guid]::NewGuid().ToString('N'))
try {
    & git clone --depth 1 'https://github.com/ShinyShinChan/FrameLounge-FireTV.git' "$folder"
    if ($LASTEXITCODE -ne 0) { throw 'Could not clone Frame Lounge GitHub repository.' }
    # Crucially includes HIDDEN .github/workflows folder; leave downloaded repo's .git intact.
    foreach ($source in (Get-ChildItem -LiteralPath $PSScriptRoot -Force)) {
        if ($source.Name -in @('.git','.gradle','.idea','__pycache__')) { continue }
        $destination = Join-Path $folder $source.Name
        if ($source.PSIsContainer -and (Test-Path -LiteralPath $destination)) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Copy-Item -LiteralPath $source.FullName -Destination $destination -Recurse -Force
    }
    Push-Location $folder
    try {
        & git add -A
        if ($LASTEXITCODE -ne 0) { throw 'Git staging failed.' }
        & git diff --cached --quiet
        if ($LASTEXITCODE -eq 0) { Write-Host 'Repository already matches this version.'; exit 0 }
        & git -c user.name='ShinyShinChan' -c user.email='41898282+ShinyShinChan@users.noreply.github.com' commit -m 'Frame Lounge v1.6.1 browser-aware catalog collection'
        if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
        & git push origin HEAD:main
        if ($LASTEXITCODE -ne 0) { throw 'Git push failed. Check repository permissions and GitHub account.' }
    } finally { Pop-Location }
    Write-Host 'Uploaded. Watch Actions: https://github.com/ShinyShinChan/FrameLounge-FireTV/actions'
} finally {
    if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue }
}
