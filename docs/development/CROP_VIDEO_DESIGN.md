# SwiftCut Crop Video — Design and implementation

Status: Phase 3D-D3 documentation, `feature/crop-video` branch (2026-11-13).

## Scope and architectural boundary

Crop Video is a **re-encoding** workflow. It is intentionally independent of SwiftCut's original lossless cut/export pipeline. Do not route Crop Video through the legacy lossless export path or change the legacy export defaults merely to support crop.

The implementation is split across:

| Layer | Responsibilities | Key files |
| --- | --- | --- |
| Renderer | Crop rectangle, resize controls, output preview and export options | `src/renderer/src/components/VideoCrop/VideoCropWorkspace.tsx` |
| Geometry | Visible-space dimensions and pointer/crop transforms | `src/renderer/src/videoCropGeometry.ts` |
| Source orientation | Read FFprobe Display Matrix or legacy `rotate` tag | `src/renderer/src/videoCropRotation.ts` |
| Time selection | Selected, inverse-selected or entire video | `src/renderer/src/videoCropSegments.ts` |
| Plan | Validate request; sort segments and derive dimensions, SAR and filenames | `src/renderer/src/videoCropExportPlanner.ts` |
| Shared contracts | Configuration, plan and bounds validation | `src/common/videoCropTypes.ts`, `src/common/videoCropValidation.ts` |
| Main process | Probe source; validate again; run, cancel, verify, commit and clean up | `src/main/videoCropExportService.ts` |
| FFmpeg arguments | Build encoding and concat-demuxer commands | `src/main/videoCropFfmpegArgs.ts`, `src/main/videoCropConcat.ts` |
| Progress UI | Show persistent progress, cancellation and output paths | `src/renderer/src/components/VideoCrop/CropExportProgress.tsx` |

The renderer calls the main-process `startCropExport`, `getCropExportStatus` and `cancelCropExport` APIs. `App.tsx` polls status while a job is tracked. Progress is a persistent panel, not an auto-dismissing Toast.

## Coordinate system and rotation

The crop rectangle is specified in **visible/display-space** pixel coordinates. A quarter-turn swaps visible width and height. Frame metadata records source raster width/height, normalized rotation and sample aspect ratio (SAR).

Source orientation is read from FFprobe's `side_data_list` Display Matrix when available, otherwise the legacy `tags.rotate` value. The UI uses the resulting display-space frame. Crop Video does **not** add a user-facing rotation editing tool.

FFmpeg must rotate the actual source pixels exactly once, then crop in the same visible-space coordinate system. For normalized Display Matrix angles:

| Rotation | Filter sequence before crop |
| --- | --- |
| 0° | No transpose |
| 90° | `transpose=cclock` |
| 180° | `hflip,vflip` |
| 270° | `transpose=clock` |

The encoding command uses `-noautorotate`, resets input display rotation with `-display_rotation 0`, and explicitly applies the appropriate filter. Output metadata is also stripped/reset; final FFprobe verification rejects residual nonzero rotation metadata. This combination is critical: clearing only metadata without correcting pixel rotation caused an observed 180° orientation error during development. Real MP4 tests compare decoded RGB pixels with FFmpeg's correctly displayed reference for both quarter turns.

The filter chain converts to `yuv444p` before crop to preserve crop origins with odd coordinates and subsampled input, optionally scales, pads to compatible encoded dimensions when necessary, sets SAR, and converts to the configured output pixel format. Without resize, SAR is preserved (inverted for 90°/270°); resize output uses square pixels.

## Export plan and names

The renderer resolves selected or inverse-selected segments, or the whole source duration; the planner validates bounds, orders segments by start time and builds an immutable export plan.

Current default encoding: `libx264`, preset `medium`, `yuv420p`, High CRF 18 or Standard CRF 23. Files are MP4 or MKV; audio is optionally transcoded to AAC 192 kb/s if an audio stream was selected. Variable input frame timing is not intentionally forced to CFR (`-fps_mode:v passthrough`).

Output filenames use the source filename stem and `.crop`: a single/merged export yields `<stem>.crop.<ext>`, while multi-segment separate export yields `<stem>.crop-001.<ext>`, `...-002...`, etc. Existing files are never overwritten: a suffix such as `_1` is selected, with a hard-link-based final commit. Temporary work is stored per job in `<outputDir>/.swiftcut-crop-tmp/<jobId>/`.

## Revalidation and task lifecycle

The main process independently probes the source's container duration before starting a job. It validates time segments against this duration, allowing at most **0.1 second** for duration-rounding differences, and rejects material overrun. Validation is performed before encoding. The main process also verifies temporary outputs with FFprobe (nonempty file, one H.264 video stream of expected encoded dimensions, expected AAC audio presence, acceptable duration, and no nonzero display rotation).

Each time range is encoded serially into a job-specific temporary file. In merge mode the verified segments are combined using FFmpeg's concat demuxer and `-c copy`; the merged file is verified again before commit. In separate mode each verified segment is committed individually after encoding all segments.

The state machine reports `preparing`, `encoding`, `verifying`, optionally `merging`, `committing`, `cleaning`, and terminal states `success`, `partial_success`, `failed` or `cancelled`. Completion is published **after** temporary cleanup succeeds or a cleanup failure is recorded.

- A cancelled/failed job with **no committed files** is `cancelled`/`failed`, respectively.
- If one or more files were committed before a later error or cancellation, they are retained and the outcome is `partial_success`.
- If **all final files were committed**, but cleanup fails, the export remains `success` and carries a `cleanupWarning`.
- The UI counts the currently processing segment from **1**, e.g. `1/2`, then `2/2`; it does not present the number already finished as the current position.

The job service retains a bounded in-memory history of completed jobs. It makes a best-effort attempt to clean each task's temporary directory; it does not provide crash recovery or a persistent job journal.

## Key invariants

1. Keep crop encoding separate from ordinary lossless export.
2. No existing output file is overwritten; committed files are never silently discarded after partial success.
3. Crop coordinates and pixel rotation must use a consistent **display** orientation.
4. Verify every encoded temporary file before final commit; verify merged outputs again.
5. Do not report a terminal job state while cleanup is still running.
6. Preserve tested behavior when simplifying internal helpers; use real FFmpeg regression tests for changes to encoding, timing or rotation.

See [testing](CROP_VIDEO_TESTING.md), [limitations](CROP_VIDEO_LIMITATIONS.md) and [release checklist](CROP_VIDEO_RELEASE_CHECKLIST.md).
