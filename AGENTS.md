# Agent instructions for SwiftCut

## Project provenance

SwiftCut is a customized derivative based on LosslessCut v3.70.2. Read `UPSTREAM.md` before modifying inherited project identity, licensing, packaging, or upstream integration code.

## Engineering priorities

- Prefer minimal, focused changes over broad refactoring.
- Preserve inherited media-editing behavior unless the task explicitly changes it.
- Keep SwiftCut-specific business logic, especially MP3 extraction, separate from inherited export workflows.
- Reuse the existing FFmpeg/FFprobe infrastructure and network policy.
- Keep audio task cancellation scoped; never cancel unrelated FFmpeg operations.
- The approved product identity is SwiftCut (`com.swiftcut.desktop`). Do not reintroduce LosslessCut runtime identifiers. The user explicitly approved a destructive identity change; old LosslessCut user settings are not migrated.
- Do not add dependencies unless the benefit is clear and approved.
- Do not commit downloaded FFmpeg binaries, generated test media, test outputs, secrets, or local settings.

## Validation

Use the checked-in Yarn release:

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run
node .yarn\releases\yarn-4.18.0.cjs build
```

For MP3 extraction changes, run the focused tests in `src/main/audioExtraction.test.ts` and `src/main/audioExtractionService.test.ts`, followed by Windows GUI acceptance tests.

## Commits

Write commit messages in English. Describe the actual change, not just the development process. For user-visible behavior changes, add a one-line `Changelog:` trailer describing the impact.

Do not publish releases, submit store builds, deploy a website, or post announcements without explicit approval of the exact action and content.
