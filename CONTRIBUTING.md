# Contributing to SwiftCut

SwiftCut is a customized desktop media-processing application based on LosslessCut v3.70.2. Read [UPSTREAM.md](UPSTREAM.md) before changing inherited code or project metadata.

## Development environment

- Node.js 24.x
- Yarn 4.18.0, pinned in `.yarn/releases/`
- 7-Zip on `PATH` when downloading Windows FFmpeg builds
- FFmpeg/FFprobe downloaded through the repository scripts

Install dependencies:

```powershell
node .yarn\releases\yarn-4.18.0.cjs install
```

Download FFmpeg for Windows x64:

```powershell
node .yarn\releases\yarn-4.18.0.cjs download-ffmpeg-win32-x64
```

Run the application:

```powershell
node .yarn\releases\yarn-4.18.0.cjs dev
```

## Validation

Before submitting a change, run the relevant checks:

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run
node .yarn\releases\yarn-4.18.0.cjs build
```

For changes to MP3 extraction, also run:

```powershell
node .yarn\releases\yarn-4.18.0.cjs test run src/main/audioExtraction.test.ts src/main/audioExtractionService.test.ts --reporter=verbose
```

GUI changes and media-process behavior must additionally be checked in the Windows desktop application with representative local media.

## Project-specific engineering rules

- Keep the MP3 extraction business module independent from the existing video-export workflow.
- Reuse the existing FFmpeg/FFprobe process infrastructure and network policy; do not introduce a parallel process runner without a demonstrated need.
- Audio extraction cancellation must remain task-scoped. Do not use the legacy global FFmpeg abort operation to cancel only an audio task.
- Preserve completed outputs when a later task is cancelled; skip tasks that have not started; remove temporary output.
- Never overwrite an existing output file without an explicitly approved product change.
- The approved product identity is SwiftCut (`com.swiftcut.desktop`). Do not change these identifiers or the resulting user-data path without explicit approval.
- Keep upstream copyright notices and GPL licensing intact.
- Do not commit downloaded FFmpeg binaries, generated media, local test outputs, secrets, or machine-specific configuration.

## Commit messages

Write commit messages in English. Describe the actual user-visible or technical change, not merely the development process. For user-visible behavior changes, include a `Changelog:` trailer describing the impact in one line.
