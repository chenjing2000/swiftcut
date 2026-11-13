# SwiftCut Crop Video — Tests and acceptance record

Status: Phase 3D-D3 documentation, `feature/crop-video` branch (2026-11-13).

## Automated coverage

The dedicated workflow is `.github/workflows/crop-video-ci.yml` and runs on `windows-2022` for pushes to `feature/crop-video` (or manual dispatch):

```powershell
yarn install --immutable
yarn test --run
# The workflow then installs FFmpeg and runs real media tests:
$env:SWIFTCUT_CROP_FFMPEG_TEST = "1"
yarn test --run src/main/videoCropFfmpegIntegration.test.ts src/main/videoCropCompatibility.test.ts
yarn tsc
yarn lint
yarn build
```

The environment flag gates the real FFmpeg tests during the regular unit-test step. **Do not add the skipped tests to the completed-test count twice.** The compatibility/integration step must find `ffmpeg` and `ffprobe` on PATH.

### Important source and regression tests

| Coverage area | Test entry points |
| --- | --- |
| Crop and display geometry, aspect ratios, rotation transforms | `src/renderer/src/videoCropGeometry.test.ts` |
| Source Display Matrix and legacy rotation tags | `src/renderer/src/videoCropRotation.test.ts` |
| Segment selection and inverse intervals | `src/renderer/src/videoCropSegments.test.ts` |
| Planner, names and encoded dimensions | `src/renderer/src/videoCropExportPlanner.test.ts` |
| Bounds, output size and FFprobe duration tolerance | `src/renderer/src/videoCropValidation.test.ts` |
| FFmpeg encoding arguments and rotation filters | `src/main/videoCropFfmpegArgs.test.ts` |
| Job status, cancellation, no-overwrite, partial success, source duration, cleanup | `src/main/videoCropExportService.test.ts` |
| Actual single/multi-segment video encoding and concat | `src/main/videoCropFfmpegIntegration.test.ts` |
| Real SAR, portrait, MP4 Display Matrix orientation, non-AAC audio, VFR and decode | `src/main/videoCropCompatibility.test.ts` |
| FFmpeg time=`N/A` handling | `src/main/progress.test.ts` |
| Progress presentation and 1-based segment position | `src/renderer/src/components/VideoCrop/cropExportPresentation.test.ts` |

**Orientation tests must compare video pixels**, not just encoded width/height and rotation metadata. Real MP4 cases with +90° and -90° Display Matrix use distinguishable corner colors and compare decoded RGB output with the autorotated reference. This caught a genuine clockwise/counterclockwise mistake that metadata-only tests missed.

The VFR case constructs genuinely nonuniform frame timestamps and asserts that timing variation remains in output. The audio case exercises PCM input transcoded to AAC. A decoding pass validates output beyond container metadata.

### Last confirmed automated baseline before documentation

- Commit `8bb2eef44bc1acf39e5b4a757c7380f1436d0cd8`; Windows workflow run [43368753042](https://github.com/chenjing2000/swiftcut/actions/runs/43368753042): **successful**.
- Regular unit tests: **245 passed, 9 skipped** (9 real FFmpeg tests gated off in this step).
- Separately executed real FFmpeg tests: **9 passed**.
- TypeScript, Lint (0 errors / 0 warnings) and production build: **passed**.

These figures are **baseline evidence**, not evidence that the full upstream cross-platform Pull Request workflow already ran.

## User-performed Windows desktop acceptance

The following checks were reported as passing during development:

- Single-segment crop export.
- Multi-segment `Export separately` with `-001`, `-002`, etc. output files.
- Multi-segment chronological `Merge into one file` export.
- Cancelling an active merge without retaining an incomplete final file.
- Progress panel layout, percent, cancel button, final output path listing, dismiss action, dark/light theme.
- Progress panel current-segment display `1/2` then `2/2`.
- The previously problematic mobile portrait MP4, after the final quarter-turn filter correction, exported with **correct visible orientation** and no extra rotation.

The mobile orientation bug took multiple revisions: the original output rotated -90°, a metadata-only correction resulted in a 180° error, and the corrected transpose mapping plus RGB pixel tests resolved it. Preserve these tests and the final command order.

No manual claim has been established here for exhaustive operation over every possible codec, timestamp defect, network source, OS or device.

## Still required in Phase 3D-D4

1. Run the repository's **original Pull Request workflow** (`.github/workflows/test.yml`) on both Windows and Ubuntu, including docs/license and Chromium notification E2E checks where configured.
2. Check integrations of `App.tsx`, `menu.ts`, `configStore.ts` and FFprobe typing with established lossless cutting/export, shortcuts, media playback, and audio extraction.
3. Examine the final diff for unintended changes, missing translations, artifacts or temporary files.
4. Verify documentation against final code and record the final commit/workflow links.
5. Seek explicit permission **before merging** `feature/crop-video` into `main`.

See [design](CROP_VIDEO_DESIGN.md), [limitations](CROP_VIDEO_LIMITATIONS.md) and [release checklist](CROP_VIDEO_RELEASE_CHECKLIST.md).
