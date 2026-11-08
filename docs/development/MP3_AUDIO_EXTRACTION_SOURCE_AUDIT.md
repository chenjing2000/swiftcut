# MP3 Audio Extraction — Source Audit

Date: 2026-11-07  
Source: uploaded `lossless-cut-privacy-customized-fixed(1).zip`  
Version: LosslessCut 3.70.2  
Scope: M0 source audit only; no runtime source files changed in this milestone.

## 1. Confirmed existing capabilities

| Requirement | Existing source | Finding |
|---|---|---|
| Native application menu | `src/main/menu.ts` | Electron menu template; `Tools` is followed by `Help`. Add `Output` between them. |
| Menu-to-renderer actions | `src/renderer/src/App.tsx` | `useEffect` registers IPC listeners from an action list; the menu can send a dedicated `extractAudio` event. |
| Current media metadata | `src/renderer/src/App.tsx`, `src/renderer/src/ffmpeg.ts` | `mainStreams`, `mainFileMeta`, `filePath`, and `fileDuration` are already available in the app. |
| Audio stream filtering | `src/renderer/src/util/streams.ts` | `getAudioStreams()` filters `codec_type === 'audio'`. |
| Stream identity | `src/common/ffprobe.ts` | `FFprobeStream.index` is the global FFmpeg stream index; use it for `-map 0:<index>`. |
| Segment state | `src/renderer/src/hooks/useSegments.tsx` | `cutSegments`, `selectedSegments`, `segmentsOrInverse`, and `segmentsToExport` have distinct semantics. |
| Existing stream extraction | `src/renderer/src/hooks/useFfmpegOperations.ts` | `extractStreams()` handles stream-copy extraction and attachments. It is not suitable for MP3 transcoding, but its output naming and overwrite patterns can inform the new module. |
| FFmpeg invocation | `src/main/ffmpeg.ts` | `runFfmpeg`, `runFfmpegWithProgress`, and `runFfprobe` already exist. FFmpeg path and network policy are centralized here. |
| Network restriction | `src/main/networking.ts`, `src/main/ffmpeg.ts` | FFmpeg/FFprobe arguments are checked against the existing network-disable policy. Local-file inputs remain supported. |

## 2. Important confirmed conflicts and constraints

### 2.1 Global FFmpeg cancellation

`src/main/ffmpeg.ts` maintains a module-level `runningFfmpegs` set. `abortFfmpegs()` aborts every process in that set. Therefore, the audio feature must not call `abortFfmpegs()` to cancel its own work; doing so could also cancel video export or other FFmpeg operations.

`runFfmpegProcess()` creates and owns an internal `AbortController`. Its current public wrappers do not expose a per-process cancellation handle. M2/M3 implementation must add a backward-compatible task-scoped API (or an equally isolated mechanism) and preserve existing callers' behavior.

### 2.2 Progress parsing

`runFfmpegWithProgress()` parses FFmpeg stderr progress lines and returns the process promise, but currently has no per-task cancel handle. Progress and cancellation should be extended without changing existing call sites. A separate task ID must identify each audio extraction run.

### 2.3 Segment semantics

`segmentsOrInverse.selected` is the existing export selection model:
- In normal mode, selected non-marker segments are used when at least one is selected.
- If none are selected, all non-marker segments are used.
- The initial full-length segment is excluded.
- In inverse-cut mode, the inverse segments are used.
- `segmentsToChaptersOnly` makes `segmentsToExport` empty.

The new audio module must explicitly decide whether it follows `segmentsToExport` (recommended for consistency with Export) or always uses all `segmentsOrInverse.all`. It must not accidentally use `selectedSegments` directly, because that can include markers and does not implement the export fallback semantics.

For the initial implementation, snapshot `segmentsToExport` at the moment the dialog opens or the user starts extraction, and reject an empty/invalid plan with a clear message. If the app is in chapters-only mode, the planner should use the actual full timeline rather than interpreting the empty export list as no audio.

### 2.4 Stream mapping

`FFprobeStream.index` is the authoritative global stream index. The display ordinal (Track 1, Track 2) and array position are not valid substitutes. The planner must retain both display ordinal and global index.

### 2.5 Existing stream extraction is not MP3 extraction

`useFfmpegOperations.extractStreams()` builds `-c copy` commands and chooses container extensions based on the source codec. It cannot be reused as the MP3 encoder. Reuse only safe helpers/patterns such as path handling and existence checks where appropriate. The new module must explicitly encode with `libmp3lame`.

### 2.6 Electron menu action registration

`src/main/menu.ts` sends named events to the renderer. `App.tsx` registers renderer actions in its IPC action effect. Add a separate `extractAudio` action outside the exhaustive keyboard-action map unless the keyboard action schema is intentionally extended. Do not add a keyboard shortcut in this feature unless separately approved.

### 2.7 Existing network policy

`src/main/ffmpeg.ts` checks FFmpeg/FFprobe arguments using the existing networking guard. Audio extraction must call this existing FFmpeg layer with a local MP4 path; it must not bypass the guard or introduce network URLs.

## 3. Recommended implementation boundary

- Add `Output` menu between `Tools` and `Help` in `src/main/menu.ts`.
- Add a dedicated renderer action/event to open the audio extraction dialog.
- Add a small independent `audioExtraction` module for planning, command construction, execution orchestration, and output commit.
- Reuse `getAudioStreams`, FFprobe stream metadata, `segmentsToExport` semantics, path utilities, FFmpeg executable resolution, network guard, and existing dialog primitives.
- Do not call the existing `extractStreams()` for MP3 conversion.
- Do not call global `abortFfmpegs()` from audio cancellation.
- Do not modify video Export business logic.

## 4. MP3 command policy

- VBR: `-c:a libmp3lame -q:a 2`
- 320 kbps: `-c:a libmp3lame -b:a 320k`
- 192 kbps: `-c:a libmp3lame -b:a 192k`

Use argument arrays, not shell command concatenation. Map exactly one audio stream per output file. Disable video/subtitle/data output. Write to a temporary file with an MP3-recognizable suffix, probe/validate the result, then commit to the final path.

## 5. Scope and verification notes

This archive has no `.git` directory and no `node_modules` directory. Git status, branch/remotes, and a full dependency-backed build cannot be verified from this archive. The current environment is not Windows, so Windows runtime and packaged-app acceptance must be completed by the owner.

M0 is complete. Runtime source modifications should begin only after this audit has informed the implementation. No runtime source files were modified in this milestone.
