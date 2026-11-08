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

$mp3Files = @(Get-ChildItem -LiteralPath $Directory -File -Filter '*.mp3' | Sort-Object Name)
if ($mp3Files.Count -eq 0) {
    throw "No MP3 files found in: $Directory"
}

$rows = @()
$failed = 0
foreach ($file in $mp3Files) {
    try {
        $probeOutput = & $FfprobePath -v error -show_entries 'format=duration,bit_rate:stream=codec_type,codec_name,channels,sample_rate' -of json $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "ffprobe exited with code $LASTEXITCODE: $probeOutput"
        }

        $metadata = ($probeOutput -join [Environment]::NewLine) | ConvertFrom-Json
        $audioStreams = @($metadata.streams | Where-Object { $_.codec_type -eq 'audio' -and $_.codec_name -eq 'mp3' })
        $duration = 0.0
        if (-not [double]::TryParse([string]$metadata.format.duration, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$duration)) {
            throw 'Missing or invalid media duration'
        }
        if ($audioStreams.Count -ne 1 -or $duration -le 0) {
            throw "Expected one MP3 audio stream and positive duration; found $($audioStreams.Count) stream(s), duration $duration"
        }

        $rows += [pscustomobject]@{
            File = $file.Name
            DurationSeconds = [math]::Round($duration, 3)
            Codec = $audioStreams[0].codec_name
            Channels = $audioStreams[0].channels
            SampleRate = $audioStreams[0].sample_rate
            BitrateKbps = if ($metadata.format.bit_rate) { [math]::Round(([double]$metadata.format.bit_rate / 1000), 1) } else { $null }
            Result = 'PASS'
        }
    } catch {
        $failed += 1
        $rows += [pscustomobject]@{
            File = $file.Name
            DurationSeconds = $null
            Codec = $null
            Channels = $null
            SampleRate = $null
            BitrateKbps = $null
            Result = "FAIL: $($_.Exception.Message)"
        }
    }
}

$temporaryFiles = @(Get-ChildItem -LiteralPath $Directory -Force -File -Filter '*.tmp.mp3')
$rows | Format-Table -AutoSize

if ($temporaryFiles.Count -gt 0) {
    Write-Host "Temporary MP3 files remaining:" -ForegroundColor Yellow
    $temporaryFiles | Select-Object -ExpandProperty FullName
}

if ($failed -gt 0 -or $temporaryFiles.Count -gt 0) {
    throw "Audio output validation failed: $failed invalid MP3 file(s), $($temporaryFiles.Count) temporary file(s) remaining."
}

Write-Host "PASS: $($mp3Files.Count) MP3 file(s) validated; no temporary files remain." -ForegroundColor Green
