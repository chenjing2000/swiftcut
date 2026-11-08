# Manual media tests

This directory contains reusable manual-test instructions and scripts. Generated media is stored locally under `test-fixtures/` and is intentionally excluded from Git.

## Requirements

- Windows: PowerShell 5.1 or later.
- FFmpeg and FFprobe: use the binaries downloaded by the project, or provide compatible executables on `PATH`.
- A local MP4 file for basic extraction tests.
- A multi-audio MP4 for track-selection tests.
- A sufficiently long MP4 for cancellation tests.

## Automated checks

Run the focused extraction unit tests from the repository root:

```powershell
node .yarn\releases\yarn-4.18.0.cjs test run src/main/audioExtraction.test.ts src/main/audioExtractionService.test.ts --reporter=verbose
```

## Manual acceptance coverage

1. Extract a full MP4 audio track in VBR, 320 kbps, and 192 kbps modes.
2. Extract each audio track independently from a multi-track MP4.
3. Select multiple audio tracks and verify one MP3 is created per track.
4. Select multiple timeline segments and verify each segment is saved separately.
5. Confirm existing MP3 files are not overwritten.
6. Cancel an active task and confirm completed outputs remain, the active task is `Cancelled`, pending tasks are `Skipped`, and temporary files/processes are cleaned up.
7. Run a new extraction after cancellation to verify the application remains usable.

Do not commit generated MP4/MP3 files, decoded PCM files, `.llc` test projects, test manifests, or test logs.
