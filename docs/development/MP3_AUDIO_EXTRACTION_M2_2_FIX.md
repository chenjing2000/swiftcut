# M2.2 — TypeScript, Vitest isolation, and lint corrections

## Scope

This revision addresses the concrete diagnostics returned by the Windows T05–T07 runs. It does not change the MP3 output modes or the user-facing extraction workflow.

## Changes

### Audio extraction test isolation

- Moved pure MP3 FFmpeg argument construction and FFprobe JSON parsing into `src/main/audioExtractionUtils.ts`.
- `audioExtraction.test.ts` now imports only the pure helper module, not the Electron logger / FFmpeg process service.
- Reworked test names and assertions to satisfy the repository's Vitest lint rules.
- This prevents a normal Vitest Node environment from evaluating `electron.app.isPackaged` just to test pure parsing and argument helpers.

### TypeScript corrections

- Corrected the FFprobe type import path in `AudioExtractionDialog.tsx`.
- Made dialog optional data props explicit `T | undefined` because the project enables `exactOptionalPropertyTypes`.
- Made the task cancellation callback an explicit `(() => void) | undefined`.
- Omitted `duration` from `runScopedFfmpeg` options when there is no valid positive duration.
- Restored the missing `isWindows` import in `renderer/src/dialogs/index.tsx`. The import existed in the original source and was accidentally removed during privacy-related cleanup; without it, Windows file-dialog defaults could throw at runtime.
- Removed stale imports left behind by GPS removal and privacy/update-check removal.

### Audio dialog lint and React lifecycle corrections

- Changed dialog state initialization so it resets naturally when the dialog is mounted for an open action, instead of setting state synchronously inside an effect.
- Polls the running job by a stable job ID.
- Uses safe optional codec-name handling.
- Corrected radio-label associations and the reported JSX / promise / optional-chain lint issues.

### Privacy customization cleanup

- Removed stale update-version state and the menu branch that depended on the removed automatic version-check result.
- Kept explicit external links as user-initiated browser actions.
- Cleaned unused imports left by the removal of online checks and GPS/SRT map parsing.
- Applied the reported style fixes in `networking.ts`.

## Deliberately not changed

- `src/renderer/src/swal2.scss` still contains the legacy Sass `@import`.
- A safe Sass migration needs to inspect the installed SweetAlert2 Sass entry point and its `!default` variable contract. A blind `@use` replacement could silently discard the current theme overrides or alter CSS ordering. This is deferred to a separate Sass-focused change with before/after CSS and UI comparison.
- No dependency versions or lockfiles were changed.
- No network requests, auto-updates, GPS features, or video export behavior were added.

## Validation status

The supplied Windows logs were used as the diagnostic basis. This environment does not contain the project's installed Yarn dependencies, so this source archive has not been run through the Windows Vitest, TypeScript, Oxlint, or Electron production-build commands. Re-run T05–T08 on Windows before treating this revision as validated.
