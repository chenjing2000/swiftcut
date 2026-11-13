# SwiftCut Crop Video — Phase 3D-D4 release and merge checklist

Status: **Not yet approved for merge**. Prepared in Phase 3D-D3 (2026-11-13).

Branch under review: `feature/crop-video` → `main`.

## 1. Review and build gates

- [ ] Confirm current `main` and feature tips and review `main...feature/crop-video` (including original-feature changes outside crop modules).
- [ ] Confirm no unintended generated files, sensitive information, binaries or local temp folders are committed.
- [ ] Confirm documentation matches current code, CLI flags, quality presets and tested feature limits.
- [ ] Confirm English, Simplified Chinese and Traditional Chinese translation entries used by Crop Video are present/appropriate.
- [ ] Run dedicated `Crop Video Windows CI` on the **final** feature SHA; verify tests, real FFmpeg coverage, TypeScript, Lint and build.
- [ ] Open/review a Pull Request without merging it and run the repository's existing `Test` workflow for Windows and Ubuntu, including `yarn dedupe --check`, docs/license steps and Chromium notification E2E.
- [ ] Address any failures or identify concrete external CI blockers, without treating skipped/untested stages as passed.

## 2. Regression expectations

- [ ] Ordinary lossless-cut/export code paths continue using their original FFmpeg behavior and naming.
- [ ] File opening/playback, timeline seeking, keyboard shortcuts and custom keybinding migration behave as before.
- [ ] Existing audio extraction and cancellation remain independent from Crop Video export.
- [ ] Crop modes: entire/selected/inverse intervals; single, multi-segment merge and separate output.
- [ ] Output file collision never overwrites a pre-existing file.
- [ ] Cancellation leaves no incomplete committed file; any already committed files are visible as partial success.
- [ ] Temporary cleanup and its warning cannot downgrade an otherwise fully saved file to export failure.
- [ ] Time ranges beyond independently probed source duration are rejected; modest rounding differences (max 100 ms) are accepted.
- [ ] Portrait video orientation matches on-screen preview; no leftover nonzero Display Matrix rotates the output a second time.
- [ ] FFmpeg compatibility tests exercise non-square SAR, 90°/270° rotation, PCM→AAC, no-audio input, VFR and output decoding.
- [ ] Progress panel shows current segment positions starting at one and remains usable in dark/light theme.

## 3. Minimal desktop check — only for gaps in automation

The user already accepted the main crop UI, multi-segment, cancel and portrait-orientation scenarios during earlier phases. Avoid repeating full manual checks unless a post-acceptance change affects the relevant behavior.

For uncovered legacy integration, request a short, focused Windows check: opening/playback, a normal **lossless** export, an MP3 audio extraction, and a custom keyboard shortcut if it cannot be covered automatically. Record exactly what was tested; do not claim a result in advance.

## 4. Final decision record

- Dedicated crop workflow: **Passed at SHA `8bb2eef44bc1acf39e5b4a757c7380f1436d0cd8`**, [Windows run 43368753042](https://github.com/chenjing2000/swiftcut/actions/runs/43368753042), before documentation changes. Recheck at final SHA.
- Full existing Windows/Ubuntu Pull Request workflow: **Not yet run as Phase 3D-D4 validation**.
- Manual portrait rotation, crop panel, export merge/separate and cancel: **Accepted by user in earlier phases**.
- Merge authorization: **Not granted**.

**Do not merge to `main` without the user's explicit approval after final review.**

See [design](CROP_VIDEO_DESIGN.md), [testing](CROP_VIDEO_TESTING.md) and [limitations](CROP_VIDEO_LIMITATIONS.md).
