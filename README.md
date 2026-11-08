# SwiftCut

**A desktop media processing application for video cutting, track management, and audio extraction.**

SwiftCut is a customized desktop application based on the source code of [LosslessCut](https://github.com/mifi/lossless-cut), using **LosslessCut v3.70.2** as its current upstream baseline.

The project retains the upstream application's established media-processing foundation while adding SwiftCut-specific privacy controls and an independent MP3 audio-extraction workflow.

> **Development status:** SwiftCut is under active development. Its runtime and desktop packaging identifiers have been rebranded, but the repository, support destinations, and store-signing configuration are not yet SwiftCut-owned. There are no official SwiftCut binary releases. Do not use the inherited store-publishing or release configuration for distribution.

## Features

### Video editing and media handling

SwiftCut retains core capabilities inherited from LosslessCut, including:

- Lossless cutting and trimming of supported media files.
- Segment selection, markers, and timeline-based editing.
- Stream inspection and selection for video, audio, subtitles, and other tracks.
- Lossless stream copying and remuxing where the source codecs and container allow it.
- Merging compatible segments and media files.
- Metadata and chapter handling.
- Frame capture and FFmpeg-assisted media operations.

These inherited features remain subject to the same format, codec, and container limitations as the upstream implementation.

### SwiftCut-specific audio extraction

The **Output → Extract Audio** workflow is an independent business module that reuses the application's existing FFmpeg and FFprobe infrastructure.

Current scope:

- **Input:** local MP4 files.
- **Output:** MP3 files.
- **Encoding modes:** VBR (LAME Quality 2), 320 kbps CBR, or 192 kbps CBR.
- **Track selection:** extract one or multiple selected audio tracks.
- **Segment selection:** extract the selected timeline segments separately.
- **Output organization:** one MP3 file for each segment-and-track combination.
- **Task execution:** sequential FFmpeg tasks.
- **Output protection:** existing output files are not overwritten.
- **Cancellation:** the active task can be cancelled; completed MP3 files are preserved and tasks that have not started are skipped.
- **Cleanup:** task-specific temporary output is removed after success, failure, or cancellation.
- **Status reporting:** Saved, Failed, Cancelled, and Skipped are reported separately.

The extraction module is deliberately separate from the original video-export business workflow. It reuses lower-level media infrastructure rather than introducing a second FFmpeg process-management stack.

### Privacy-related customizations

This source tree also contains fork-specific privacy changes documented in [PRIVACY-CHANGES.md](PRIVACY-CHANGES.md), including:

- Network access disabled by default in the application.
- Application-level checks for Electron renderer requests and FFmpeg/FFprobe network inputs.
- Removal of selected upstream online integrations and GPS map functionality.

The network setting is an application-level control. It is not a replacement for an operating-system firewall and does not control links opened in an external browser.

## Technical stack

- Electron
- React
- TypeScript
- Vite / electron-vite
- FFmpeg and FFprobe
- Yarn 4.18.0 (the Yarn release is checked into `.yarn/releases/`)

The current Electron/Vite build targets Node.js 24. Use **Node.js 24.x** for development.

## Development setup

The commands below are shown for Windows PowerShell, which is the currently verified development environment.

### 1. Install dependencies

Run from the repository root:

```powershell
node .yarn\releases\yarn-4.18.0.cjs install
```

### 2. Download the Windows FFmpeg binaries

The FFmpeg download script places the platform binaries under the ignored `ffmpeg/` directory:

```powershell
node .yarn\releases\yarn-4.18.0.cjs download-ffmpeg-win32-x64
```

The Windows download script uses 7-Zip to extract the archive. Install 7-Zip and make `7z.exe` available on `PATH` before running this command.

Do not commit downloaded FFmpeg binaries or libraries. The repository contains the script and version pins needed to retrieve them.

### 3. Start the development application

```powershell
node .yarn\releases\yarn-4.18.0.cjs dev
```

If the Electron package is present but its executable has not been downloaded, verify the installation before starting the app:

```powershell
Test-Path .\node_modules\electron\dist\electron.exe
```

If needed, run the Electron install script:

```powershell
node .\node_modules\electron\install.js
```

## Development checks

Run these commands from the repository root:

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run
node .yarn\releases\yarn-4.18.0.cjs build
```

Run the complete project check when the local environment is ready:

```powershell
node .yarn\releases\yarn-4.18.0.cjs check
```

The focused MP3 extraction tests can be run independently:

```powershell
node .yarn\releases\yarn-4.18.0.cjs test run src/main/audioExtraction.test.ts src/main/audioExtractionService.test.ts --reporter=verbose
```

Manual media fixtures and test outputs are local-only. See [test-manual/README.md](test-manual/README.md) and [test-fixtures/README.md](test-fixtures/README.md).

## Project structure

```text
.
├── .github/                 GitHub issue templates and CI workflows
├── .yarn/                   Pinned Yarn release, plugins, and patches
├── docs/                    Documentation inherited from the upstream project
│   └── development/         SwiftCut implementation notes and audits
├── ffmpeg/                  Downloaded local FFmpeg binaries (not committed)
├── locales/                 Application translations
├── script/                  Build, maintenance, and media utility scripts
├── src/
│   ├── common/              Shared types and utilities
│   ├── main/                Electron main process and media services
│   ├── preload/             Electron preload bridge
│   └── renderer/            React user interface
├── test-fixtures/           Local generated test media (not committed)
├── test-manual/             Manual test instructions and scripts
└── website/                 Inherited upstream website source; not yet rebranded
```

## Project identity and compatibility

SwiftCut is the application and product name. The runtime and packaging identity has been changed to SwiftCut:

- Electron application name: `SwiftCut`.
- Electron Builder application ID: `com.swiftcut.desktop`.
- Windows executable and package name: `SwiftCut.exe` / `SwiftCut`.
- Linux executable and desktop entry: `swiftcut` / `swiftcut.desktop`.
- Linux AppStream ID: `com.swiftcut.desktop`.
- macOS bundle identifier: `com.swiftcut.desktop`.

This is a deliberately destructive rebrand for a single-user development build. Electron's default user-data directory changes with the application name; existing LosslessCut settings are not migrated. The `.llc` project-file extension remains unchanged so existing project files can still be opened explicitly.

Some external links still point to upstream LosslessCut resources because a SwiftCut-owned repository, website, and support channels have not yet been established. These links are upstream resources, not official SwiftCut services. The inherited `website/` directory is retained as upstream source and is not configured for SwiftCut deployment. Store signing and provisioning must be configured independently before any Microsoft Store or Mac App Store package is produced.

## License

SwiftCut is a derivative work based on LosslessCut. The current source is distributed under **GPL-2.0-only**, consistent with the upstream license. See [LICENSE](LICENSE) and [UPSTREAM.md](UPSTREAM.md).

Third-party dependencies, bundled media tools, icons, fonts, and other assets may carry additional notices or license conditions. Preserve their notices and review the generated license report before distributing a build.

## Acknowledgements

SwiftCut builds on the work of [Mikael Finstad](https://github.com/mifi) and contributors to [LosslessCut](https://github.com/mifi/lossless-cut), as well as the FFmpeg project and the maintainers of the libraries used by this application.

See [UPSTREAM.md](UPSTREAM.md) for provenance and customization notes.
