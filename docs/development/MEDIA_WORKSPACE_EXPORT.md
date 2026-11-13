# SwiftCut media workspace and video export

## Scope

Each source video/audio owns a lazily-created sibling workspace named after its
filename without the final extension. For example:

```text
D:\Videos\Travel.mp4
D:\Videos\Travel\Lossless\
D:\Videos\Travel\Croploss\
D:\Videos\Travel\Audio\
```

Do not create directories merely because a file was opened or an export
panel was displayed. Create the relevant directory only for an actual output
operation. Sources with equal filename stems share a workspace, even if their
extensions differ.

The **Output** menu remains, in order: **Extract Audio**, **Crop Video...**,
**Export Video**. Export Video refers to the legacy lossless cutting workflow,
not the separately implemented re-encoded Crop Video workflow.

## Default names

| Output | Default filename |
| --- | --- |
| Entire lossless source | `Travel_lossless.mp4` |
| Entire crop range | `Travel_croploss.mp4` |
| Entire extracted audio | `Travel_audio.mp3` |
| Two extracted tracks | `Travel_audio_track_01.mp3`, `Travel_audio_track_02.mp3` |
| Extracted segment | `Travel_segment_01.mp3` |
| Extracted segment and track | `Travel_segment_01_track_01.mp3` |
| Segment 1 of 3 | `Travel_segment_01.mp4` |
| Segment 2 of 3 | `Travel_segment_02.mp4` |
| Merged segments | `Travel_segments_merge.mp4` |
| Chapters-only output | `Travel_chapters.mp4` |

The extension is the actual selected output format. Segment numbers are
zero-padded to at least two digits, expanding with the segment count.
Existing outputs must never be overwritten: conflicts produce
`Travel_segment_01 (1).mp4`, `Travel_segment_01 (2).mp4`, etc.
A multi-file batch uses the same parenthesized collision index for every
member of that batch. Audio extraction likewise groups outputs under
`Audio/`, with `_track_XX` suffixes where needed to distinguish multiple
streams. Temporary FFmpeg files are written before final publication.
Concurrent name conflicts never overwrite existing files; extraction reports
a conflict if a separately running writer claims one of its planned names.

## Lossless export UI

The Export Video panel is 380px wide, matching Crop Video. It has a
**Directory** single-line editable field plus folder-picker button, and a
**Filename** single-line editable field of identical width. Native input
horizontal scrolling keeps the caret visible in long paths or names.
Defaults are derived from the current source and export mode and reset whenever
Export Video is opened from the Output menu. Custom values belong to the current
opening; they do not change defaults for other sources. Unsafe names and incompatible extensions are rejected. Advanced
options default to collapsed.

The legacy E shortcut and the previous top/bottom lossless export controls
are retired. The export settings panel is the only manual lossless export
entry point.

## Transitional compatibility

The shared FFmpeg/FFprobe installation and extraction codec/quality options
remain unchanged. Extract Audio now writes files under `Audio/`. The global `customOutDir` setting remains for
legacy project, snapshot, batch and other unrelated operations. Video exports
no longer use it as their destination. Other per-media folders such as
`cache/` and `shotscreen/` are reserved for later incremental migrations.
Create a `cache/` in the parent directory of the data that owns that cache;
do not pre-create cache directories or treat user exports as disposable cache.

## Verification

Run Windows CI and the cross-platform Test workflow including unit tests,
real FFmpeg crop integration tests, TypeScript checks, lint, and build.
Inspect all three Output settings panels interactively before merging.

## Shared Output presentation and lifecycle

The three settings windows share the same panel chrome and action button
styles. Crop and Export also share the same floating-title drag hook.
Audio extraction keeps its Radix Dialog settings shell, with the same visible
title and footer appearance. Its running and completed jobs now appear in an
independent bottom-right progress panel, even when the settings popup is closed
or a different source is opened. Crop, lossless, and audio progress panels share
display-only headers and output path lists while maintaining independent jobs.
The audio failure prompt retains its pause, continue, and cancel behavior.

Lossless validation must precede the `export-start` event. Once media files
have been published, finalization must not report a later cancellation or
cleanup error as a failed export. Post-export cleanup errors are reported
separately. Existing source media, historical outputs, and non-task files
must never be deleted by task-temp cleanup. Lossless publication rolls back
links created by an incomplete output batch; an unexpected temporary-file
cleanup failure after publication does not turn saved media into a failed job.


## Output settings behavior

All three Output settings windows remain open when their main action starts;
only an explicit Cancel, close button, or Escape closes the settings window.
Extract Audio retains its own right-bottom task progress panel; the settings
dialog may stay open at the same time.

Audio extraction adopts Crop Video's selected-segments versus entire-source
time range and its merge-versus-separate output mode. Merge is relevant only
with two or more selected segments, and creates one
`<source>_segments_merge.<ext>` per selected audio track (with
`_track_XX` when multiple tracks are selected). Individual intermediate
segment files are temporary and are removed after merging. Output format
defaults to Original format (stream copy); MP3 (re-encode) offers VBR
(LAME Quality 2), 128 kbps, 192 kbps, and 320 kbps. The format and quality
controls use matching right-aligned dropdown widths.
