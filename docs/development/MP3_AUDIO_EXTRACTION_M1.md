# MP3 Audio Extraction — M1 Implementation

Date: 2026-11-07

## Scope

M1 adds the Output menu entry and a read-only extraction configuration dialog. It does not execute FFmpeg and does not create audio files.

## Changes

- Added `Output` between `Tools` and `Help` in the Electron application menu.
- Added the `Extract Audio` menu action and a dedicated renderer action.
- Added `AudioExtractionDialog`, using the existing Radix dialog, button, and checkbox components.
- The dialog reads the currently opened file path, existing FFprobe audio stream metadata, and `segmentsToExport` snapshot supplied by the main application.
- The first audio stream is selected by default; multiple streams can be selected.
- The quality radio group offers VBR (LAME Quality 2), 320 kbps, and 192 kbps, with VBR selected by default.
- The dialog currently accepts only files with an `.mp4` extension whose FFprobe format list identifies an MP4-family container.
- The Extract Audio button remains disabled intentionally. Actual extraction belongs to M2 and is not falsely presented as working in M1.

## Isolation

- No existing video Export implementation was changed.
- No FFmpeg process, cancellation, or network-policy implementation was changed.
- No new dependencies were added.
- No GPS/map, privacy, or network-toggle code was changed.

## Verification

- Source-level review performed for menu event registration, action registration, and dialog wiring.
- Full TypeScript build, lint, tests, Electron runtime, and Windows UI verification have not been run because this source archive does not include `node_modules` and the current execution environment is not Windows.

## Next

M2 will add the independent MP3 extraction planner/service and task-scoped process cancellation. It must preserve the global FFmpeg cancellation behavior for existing callers and must not call `abortFfmpegs()` to cancel an audio-only task.
