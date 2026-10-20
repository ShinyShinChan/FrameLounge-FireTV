# Run on Windows PowerShell once to generate your own permanent Android signing identity.
# This file never commits the keystore or password to GitHub. Keep a private backup.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
    Write-Host 'Install a JDK with keytool (for example JDK 17), then run again.'
    exit 1
}
$destination = Join-Path $env:USERPROFILE 'FrameLounge-Signing'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$file = Join-Path $destination 'framelounge-signing.p12'
if (Test-Path $file) { throw "Signing keystore already exists: $file. DO NOT overwrite it; you need the same keystore for all APK upgrades." }
$secure = Read-Host 'Create a password for your permanent signing key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($pass.Length -lt 8) { throw 'Use at least 8 characters.' }
& keytool -genkeypair -noprompt -alias 'framelounge' -keyalg RSA -keysize 3072 -validity 10000 -storetype PKCS12 -keystore $file -storepass $pass -keypass $pass -dname 'CN=Frame Lounge Fire TV, O=Personal Project, C=US'
if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
[Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) | Set-Clipboard
Write-Host "`nCopied signing keystore to clipboard. Paste into GitHub Actions secret FRAME_LOUNGE_KEYSTORE_BASE64."
Write-Host 'Create another secret FRAME_LOUNGE_KEYSTORE_PASSWORD with the password you chose.'
Write-Host "Keep private backups of $file and your password. Never upload the keystore file to your public repository."
$pass = $null
