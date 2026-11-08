# LosslessCutSimple M2.5

## Audio extraction cancellation state and UI refinement

M2.5 is a focused correction to the custom MP3 audio extraction module. It does not change the existing FFmpeg process runner, MP3 quality settings, track/segment planning, output naming, or no-overwrite commit behavior.

## Changes

- A task whose FFmpeg process was active when cancellation was requested is reported as `cancelled`.
- Tasks that had not started are reported as `skipped`.
- Tasks already committed to their final MP3 path remain `success` (`Saved`) and are not removed by a later cancellation.
- Cancellation/abort exceptions are treated as expected control flow. They do not populate task or job error details and are not logged as extraction failures.
- Real extraction failures remain `failed`, retain their error details, and continue to be logged.
- The renderer displays state-specific colors, shows `Skipped`, and only displays red task details for genuinely failed tasks.
- English and Simplified Chinese translations include the new `Skipped` state.
- A cancellation summary distinguishes saved, failed (when present), cancelled, and skipped task counts.

## Files changed

- `src/main/audioExtraction.ts`
- `src/main/audioExtractionService.test.ts`
- `src/renderer/src/components/AudioExtraction/AudioExtractionDialog.tsx`
- `locales/en/translation.json`
- `locales/zh_Hans/translation.json`

## Validation

The following checks were completed in the available build environment:

- TypeScript/TSX syntax transpilation for the changed implementation and related test files: passed.
- English and Simplified Chinese translation JSON parsing: passed.
- A runtime harness using mocked FFprobe/FFmpeg verified partial cancellation, preservation of an already completed MP3, `cancelled`/`skipped` task states, absence of cancellation error details, temporary-file cleanup, and prevention of later FFmpeg tasks from starting: passed.
- The same runtime harness verified that a genuine encoder failure remains `failed` and retains its error detail: passed.

The repository's full Vitest, Oxlint, and project type-check commands were not run in this environment because dependencies were not present and Yarn dependency installation did not complete. Run the Windows commands below in the project root after applying the patch.

## Windows verification commands

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run src/main/audioExtraction.test.ts src/main/audioExtractionService.test.ts --reporter=verbose
```

## Manual GUI check

Use a multi-track, multi-segment MP4. Start extraction, wait until the first MP3 is saved and the next task is running, then cancel. Confirm that:

1. The first MP3 remains present and playable.
2. The active task is `Cancelled` and is not accompanied by a red FFmpeg abort log.
3. Tasks that did not start are `Skipped`.
4. No `.tmp.mp3` files remain and no related FFmpeg process remains.
5. A subsequent extraction can run normally.

For a genuine encoder/input failure, confirm that the failed task still displays its red error detail.
