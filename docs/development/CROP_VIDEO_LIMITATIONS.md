# SwiftCut Crop Video — Supported features and known limitations

Status: Phase 3D-D3 documentation, `feature/crop-video` branch (2026-11-13).

## Available in the reviewed branch

| Capability | Current behavior |
| --- | --- |
| Crop rectangle | Interactive display-space rectangle, coordinate/size input, aspect ratio choices, edit and output preview |
| Time range | Explicit selected segments, inverse selection when enabled, or entire video |
| Multiple segments | Merge in chronological order, or export individual files |
| Containers | MP4 and MKV |
| Video encoding | Software H.264 via `libx264`, preset `medium`, output `yuv420p` |
| Quality options | High (CRF 18) and Standard (CRF 23) |
| Audio | Keep supported selected audio by AAC transcoding (192 kb/s), or export no audio |
| Dimensions | Original crop size or scaled output; even-size padding for `yuv420p` when required |
| Pixel aspect ratio | Preserve/invert SAR on unscaled crops as appropriate; square-pixel output when resized |
| Orientation | Recognize quarter-turn Display Matrix / legacy rotate metadata and normalize output orientation |
| Job lifecycle | Progress, cancel, status, no-overwrite final commit and temporary-file cleanup |
| Partial results | Keep successfully committed separate files if a subsequent commit fails |

## Not implemented / intentionally constrained

- **This is not lossless cropping.** Pixel cropping requires a new H.264 encode. The original lossless cut/export remains a separate feature.
- The **Custom** quality option is visible as a disabled/unavailable choice; it is not implemented for export. The type definitions mention additional encoders, presets and pixel formats but current request validation intentionally accepts only the reviewed `libx264` / `medium` / `yuv420p` combination.
- Hardware H.264 acceleration, HEVC/H.265 crop output and general-purpose codec/profile selection are not part of the current crop workflow.
- Only the selected primary audio stream is used when audio is kept. Multi-audio-track preservation, subtitle-track inclusion and chapters are not part of the crop export pipeline.
- The crop feature supports **metadata-compatible display orientation**, not a user-controlled rotate-video tool. The tested rotations are 0°, 90°, 180° and 270°.
- The output area may include narrow black padding when dimensions need adjustment for `yuv420p` compatibility; the requested crop area itself is not silently rounded inward.
- Merge uses **stream copy of separately encoded crop segments**. It is not a general-purpose merger for arbitrary input files with incompatible codecs or stream layouts.
- Tasks execute serially; no parallel video encoding, persistent queue or resumable export is implemented.
- Temporary output cleanup is best effort. A forced process termination, OS crash, filesystem lock or permission error may leave temporary files; a cleanup warning is shown where the running application can detect the error.
- Duration verification allows bounded drift. It is not a frame-perfect synchronization guarantee for every damaged or unusual source.
- Windows CI covers the known media cases; this is **not** evidence of exhaustive codec/device/operating-system compatibility.

## Operational caveats

The main process uses FFprobe to validate source duration before starting Crop Video and rejects invalid selected ranges; a maximum 100 ms rounding tolerance is used where independently measured durations differ. On supported local files, the output directory must be writable. Existing output files are not overwritten, and a suffix is added if needed.

A job may report `partial_success` after an error during multi-file commit. Already completed output files remain available; users should inspect the output-path list rather than assume that a failed batch produced no files.

An output that was fully committed can report `success` along with a `cleanupWarning` if only temporary-file cleanup failed. These states are intentionally independent.

## Potential future work (not promised)

Custom encoders/quality controls, extra stream handling, crash-recovery cleanup, broader source compatibility and additional full UI automation can be considered separately. They are **outside** the accepted Phase 3C/3D scope unless explicitly approved.

See [design](CROP_VIDEO_DESIGN.md), [testing](CROP_VIDEO_TESTING.md) and [release checklist](CROP_VIDEO_RELEASE_CHECKLIST.md).
