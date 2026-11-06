param([string]$SqlServer = 'localhost\SQLEXPRESS')

$ErrorActionPreference = 'Stop'
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS and reopen PowerShell.' }
if ([int]((& node --version).TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node.js 24 or later is required.' }
if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm is required; reinstall Node.js 24 with npm.' }
$odbc = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server'
if (!(Test-Path -LiteralPath $odbc)) { throw 'Install Microsoft ODBC Driver 18 for SQL Server (x64), then run setup again.' }

$previousDirectory = Get-Location
try {
    Set-Location -LiteralPath $PSScriptRoot
    & node backend/scripts/configure-local.ts $SqlServer
    if ($LASTEXITCODE -ne 0) { throw 'Local environment setup failed.' }
    & npm.cmd ci --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and npm output.' }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Check SQL Server name, Windows access and backend/.env.' }
    # Seed is only needed on a fresh database; never reset existing data.
    & npm.cmd run db:seed -w backend -- --if-empty
    if ($LASTEXITCODE -ne 0) { throw 'Seed stopped. Existing demo data is not overwritten; see the message above.' }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. See the error above.' }
    Write-Host 'Setup complete. Accounts: manager@example.test, teacher@example.test, student@example.test'
    Write-Host 'Password: DEMO_PASSWORD in backend/.env. Start with Start-Local.ps1 -WithoutEmailMfa.'
} finally {
    Set-Location -LiteralPath $previousDirectory.Path
}
