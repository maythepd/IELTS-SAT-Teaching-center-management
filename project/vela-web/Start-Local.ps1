param(
    [switch]$Development,
    [switch]$WithoutEmailMfa
)

$ErrorActionPreference = 'Stop'
$previousMfa = $env:MFA_REQUIRED
$portableNode = Join-Path (Split-Path $PSScriptRoot -Parent) '.tools\node-v24.22.2-win-x64'
if (Test-Path (Join-Path $portableNode 'node.exe')) {
    $env:PATH = $portableNode + ';' + $env:PATH
}
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 24 is required. Install Node.js 24 or restore the workspace .tools directory.'
}
if ([int]((& node --version).TrimStart('v').Split('.')[0]) -lt 24) {
    throw 'Node.js 24 or later is required.'
}
if (!(Test-Path (Join-Path $PSScriptRoot 'backend\.env'))) {
    throw 'Create backend/.env from backend/.env.example before starting.'
}
if ($WithoutEmailMfa) {
    # Process-only setting for local testing; backend/.env is not modified.
    $env:MFA_REQUIRED = 'false'
    Write-Host 'Local test mode: email MFA disabled for this process only.'
}
$previousDirectory = Get-Location
try {
    Set-Location -LiteralPath $PSScriptRoot
    $env:NEXT_TELEMETRY_DISABLED = '1'
    if ($Development) { & npm.cmd run dev }
    else { & npm.cmd start }
    if ($LASTEXITCODE -ne 0) { throw "Application stopped with exit code $LASTEXITCODE." }
} finally {
    $env:MFA_REQUIRED = $previousMfa
    Set-Location -LiteralPath $previousDirectory.Path
}
