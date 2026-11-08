# MP3 Audio Extraction M2.1 — FFprobe JSON parsing fix

## Reported issue

The Windows development build showed `SyntaxError: Unexpected non-whitespace character after JSON at position 3` when starting extraction. The exception originated in `probe()` before the FFmpeg encoding process was started, so no MP3 conversion had begun.

## Root cause and correction

The shared `runFfprobe()` helper deliberately captures stdout as a Buffer (`encoding: 'buffer'`). The audio extraction probe now explicitly decodes those bytes as UTF-8 with `TextDecoder`, strips an optional UTF-8 BOM, and parses the JSON object. This follows the established `readFormatData()` pattern in `src/main/ffmpeg.ts`.

The parser also reports a bounded output excerpt if FFprobe does not return valid JSON, rather than exposing only a generic JSON parser exception.

## Tests added

- Parse UTF-8 Buffer output matching FFprobe's JSON structure.
- Parse output with a UTF-8 BOM and harmless prefix/suffix text.
- Report a useful error when no JSON object is present.

## Scope

- No changes to existing video export behavior.
- No changes to network settings or GPS-related code.
- No new dependencies.
- No changes to MP3 quality presets or output naming.

## Verification limitation

The source-level regression tests were added. Full project typecheck, Vitest execution, Electron runtime validation, and a Windows MP4 extraction retry must be performed with the project's installed dependencies and FFmpeg binaries.
