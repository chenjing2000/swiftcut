param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Directory,

    [string]$FfprobePath = 'ffprobe'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
    throw "Output directory does not exist: $Directory"
}

$expectedCodecs = @{
    '.m4a' = @('aac', 'alac')
    '.mp3' = @('mp3')
    '.ac3' = @('ac3')
    '.eac3' = @('eac3')
    '.opus' = @('opus')
}

$audioFiles = @(Get-ChildItem -LiteralPath $Directory -File -Force |
    Where-Object {
        $_.Extension.ToLowerInvariant() -in @('.m4a', '.mp3', '.ac3', '.eac3', '.opus', '.mka')
    } |
    Sort-Object Name)

if ($audioFiles.Count -eq 0) {
    throw "No supported audio output files found in: $Directory"
}

$rows = @()
$failed = 0

foreach ($file in $audioFiles) {
    try {
        $probeOutput = & $FfprobePath -v error -show_entries 'format=duration,size,format_name:stream=codec_type,codec_name' -of json $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "ffprobe exited with code $LASTEXITCODE: $probeOutput"
        }

        $metadata = ($probeOutput -join [Environment]::NewLine) | ConvertFrom-Json
        $streams = @($metadata.streams)
        $audioStreams = @($streams | Where-Object { $_.codec_type -eq 'audio' })
        $nonAudioStreams = @($streams | Where-Object { $_.codec_type -ne 'audio' })

        if ($audioStreams.Count -ne 1) {
            throw "Expected exactly one audio stream; found $($audioStreams.Count)"
        }
        if ($nonAudioStreams.Count -gt 0) {
            throw "Unexpected non-audio stream(s): $($nonAudioStreams.Count)"
        }

        $extension = $file.Extension.ToLowerInvariant()
        if ($expectedCodecs.ContainsKey($extension) -and $audioStreams[0].codec_name -notin $expectedCodecs[$extension]) {
            throw "Codec '$($audioStreams[0].codec_name)' does not match output extension '$extension'"
        }

        $duration = 0.0
        if (-not [double]::TryParse([string]$metadata.format.duration, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$duration) -or $duration -le 0) {
            throw 'Missing or invalid media duration'
        }

        $rows += [pscustomobject]@{
            File = $file.Name
            DurationSeconds = [math]::Round($duration, 3)
            Codec = $audioStreams[0].codec_name
            Container = $metadata.format.format_name
            SizeBytes = $file.Length
            Result = 'PASS'
        }
    } catch {
        $failed += 1
        $rows += [pscustomobject]@{
            File = $file.Name
            DurationSeconds = $null
            Codec = $null
            Container = $null
            SizeBytes = $file.Length
            Result = "FAIL: $($_.Exception.Message)"
        }
    }
}

$temporaryFiles = @(Get-ChildItem -LiteralPath $Directory -File -Force |
    Where-Object { $_.Name -match '\.tmp\.(m4a|mp3|ac3|eac3|opus|mka)$' })

$rows | Format-Table -AutoSize

if ($temporaryFiles.Count -gt 0) {
    Write-Host "Temporary audio files remaining:" -ForegroundColor Yellow
    $temporaryFiles | Select-Object -ExpandProperty FullName
}

if ($failed -gt 0 -or $temporaryFiles.Count -gt 0) {
    throw "Original audio output validation failed: $failed invalid file(s), $($temporaryFiles.Count) temporary file(s) remaining."
}

Write-Host "PASS: $($audioFiles.Count) audio output file(s) validated; no temporary files remain." -ForegroundColor Green
