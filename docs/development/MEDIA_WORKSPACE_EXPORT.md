# SwiftCut media workspace and video export

## Scope

Each source video/audio owns a lazily-created sibling workspace named after its
filename without the final extension. For example:

```text
D:\Videos\Travel.mp4
D:\Videos\Travel\Lossless\
D:\Videos\Travel\Croploss\
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
| Segment 1 of 3 | `Travel_segment_01.mp4` |
| Segment 2 of 3 | `Travel_segment_02.mp4` |
| Merged segments | `Travel_segments_merge.mp4` |
| Chapters-only output | `Travel_chapters.mp4` |

The extension is the actual selected output format. Segment numbers are
zero-padded to at least two digits, expanding with the segment count.
Existing outputs must never be overwritten: conflicts produce
`Travel_segment_01 (1).mp4`, `Travel_segment_01 (2).mp4`, etc.
A multi-file batch uses the same parenthesized collision index for every
member of that batch. Temporary FFmpeg files are written in a task-scoped
directory before final publication.

## Lossless export UI

The Export Video panel is 380px wide, matching Crop Video. It has a
**Directory** single-line editable field plus folder-picker button, and a
**Filename** single-line editable field of identical width. Native input
horizontal scrolling keeps the caret visible in long paths or names.
Defaults are derived from the current source and export mode. Custom values
belong to the currently opened source; they do not change defaults for other
sources. Unsafe names and incompatible extensions are rejected. Advanced
options default to collapsed.

The legacy E shortcut and the previous top/bottom lossless export controls
are retired. The export settings panel is the only manual lossless export
entry point.

## Transitional compatibility

The shared FFmpeg/FFprobe installation and independent Extract Audio
workflow remain unchanged. The global `customOutDir` setting remains for
legacy project, snapshot, batch and other unrelated operations. Video exports
no longer use it as their destination. Other per-media folders such as
`cache/` and `shotscreen/` are reserved for later incremental migrations.
Create a `cache/` in the parent directory of the data that owns that cache;
do not pre-create cache directories or treat user exports as disposable cache.

## Verification

Run the Windows CI suite including unit tests, real FFmpeg crop integration
tests, TypeScript checks, lint, and production build. Inspect both export
panels interactively before merging.
