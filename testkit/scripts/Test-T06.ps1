$ErrorActionPreference = 'Continue'
$PackageRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $PackageRoot
Set-Location $ProjectRoot

$ResultsDir = Join-Path $ProjectRoot 'test-results'
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
$Log = Join-Path $ResultsDir ("T06-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Start-Transcript -Path $Log -Force | Out-Null

try {
    Write-Host "`n===== TYPESCRIPT TYPE CHECK =====" -ForegroundColor Cyan
    Write-Host "ProjectRoot: $ProjectRoot"

    $YarnRelease = Join-Path $ProjectRoot '.yarn\releases\yarn-4.18.0.cjs'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js was not found in PATH.'
    }
    if (-not (Test-Path $YarnRelease)) {
        throw "Project Yarn release was not found: $YarnRelease"
    }

    $YarnArgs = @('tsc')
    Write-Host ("Running: node .yarn\releases\yarn-4.18.0.cjs " + ($YarnArgs -join ' '))
    & node $YarnRelease @YarnArgs
    $ExitCode = $LASTEXITCODE

    Write-Host "`n===== RESULT ====="
    if ($ExitCode -eq 0) {
        Write-Host "T06 PASS — command exited with code 0." -ForegroundColor Green
    } else {
        Write-Host "T06 FAIL — command exited with code $ExitCode." -ForegroundColor Red
    }
    Write-Host "ExitCode: $ExitCode"
    Write-Host "Log: $Log"
}
catch {
    Write-Host "T06 ERROR: $_" -ForegroundColor Red
}
finally {
    Stop-Transcript | Out-Null
}
