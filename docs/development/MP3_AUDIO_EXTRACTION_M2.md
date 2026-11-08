# MP3 Audio Extraction — M2 implementation

Date: 2026-11-07

## Implemented

- The M1 Output > Extract Audio dialog now starts an actual local conversion of **one selected audio stream from an entire MP4**.
- Quality is mutually exclusive: VBR LAME `-q:a 2` (default), CBR `-b:a 320k`, or CBR `-b:a 192k`.
- Input is checked by extension, file metadata, FFprobe container format and FFprobe audio stream index.
- A new audio-only service manages its own process cancellation and status; it does **not** invoke or register with the legacy global `abortFfmpegs()` cancellation group.
- MP3 is first produced into a task-specific hidden `.tmp.mp3` in the source file's directory. Output is checked via FFprobe before being atomically linked to a new final filename, then the temporary filename is removed. Existing output names are not overwritten; `_1`, `_2`, etc. are attempted.
- Progress and task cancellation are available in the dialog; status polling uses the existing typed renderer-to-main RPC bridge.
- When the app quits, pending audio-only jobs are signaled to cancel. Waiting for their complete termination before app shutdown is deferred to M4.
- No new npm packages and no new external network requests were added.
- Removed 134 generated `.js` files from source paths when a matching `.ts`/`.tsx` file exists; these were present in the M1 zip and could overshadow source imports.

## Explicit M2 limitations

- Multiple tracks and multiple video segments are intentionally **not implemented** yet. The dialog's action button is disabled whenever these are selected; M3 will add the task planner/queue.
- Only same-folder output is available. Windows NTFS hard links are used for no-overwrite atomic publication; output publication may fail on filesystems that do not support hard links.
- Progress is based on FFmpeg stderr and input format duration, and may remain at 0 until a duration is available.
- The UI's extraction-dialog close button can close the dialog during work. The job continues in the main process and is cancellable via re-opening the dialog; M4 will refine lifecycle and window-close handling.
- The main process exposes extraction methods on the existing RPC. The current RPC method authorization model is unchanged.
- Existing privacy settings, video Export and GPS map removal were not otherwise changed.

## Validation completed in this environment

- TypeScript/TSX **syntax-only** transpilation of affected source files: no syntax diagnostics.
- Used the locally available FFmpeg/FFprobe to generate an MP4 with AAC and successfully convert its audio to `mp3` using the M2 stream-selection/VBR argument pattern.
- Source ZIP integrity check and generated JS shadow-file scan performed.

## Not verified

- Yarn-based full typecheck, project Vitest suite, Vite build, Electron/Windows GUI operation, actual multi-audio MP4, and real process cancellation (project dependencies and Windows Electron runtime are not available in this container).
- Windows acceptance testing is mandatory before describing M2 as production-ready.

## Windows test steps

1. Backup the existing working source directory, then extract this archive to a **new** source folder; do not copy its contents over your working `node_modules` or FFmpeg.
2. Reuse your project-local `.yarn` release, `node_modules` and `ffmpeg/win32-x64/lib/` as appropriate.
3. Run `node .yarn\\releases\\yarn-4.18.0.cjs install` and confirm `node_modules\\electron\\dist\\electron.exe` exists. Only if the Electron npm package exists but the binary does not, run `node .\\node_modules\\electron\\install.js`.
4. Run `node .yarn\\releases\\yarn-4.18.0.cjs tsc`, `node .yarn\\releases\\yarn-4.18.0.cjs test run`, then `node .yarn\\releases\\yarn-4.18.0.cjs dev`.
5. Open an MP4 with one AAC audio stream, Output > Extract Audio, test each of the three quality options and verify MP3 playback. Check network setting OFF and original Export remains operational.
