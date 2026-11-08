# Upstream provenance and customization

## Upstream project

- **Project:** LosslessCut
- **Repository:** https://github.com/mifi/lossless-cut
- **Source baseline:** v3.70.2
- **Original author shown in the inherited package metadata:** Mikael Finstad
- **Upstream license:** GPL-2.0-only
- **License file:** [`LICENSE`](LICENSE)

SwiftCut is a customized derivative based on the LosslessCut v3.70.2 source tree. The current working repository was initialized separately; it does not contain the upstream Git commit history or an upstream Git remote. This document records the source provenance so that the origin of inherited code remains clear.

## Main customization areas

### Independent MP3 audio extraction

SwiftCut adds an independent audio-extraction business module, accessible from the Output menu. It reuses the existing FFmpeg/FFprobe infrastructure while keeping its task planning, MP3 encoding, output publication, progress, cancellation, and status reporting separate from the original media-export workflow.

The current supported workflow extracts MP3 audio from MP4 input. It supports VBR (LAME Quality 2), 320 kbps, and 192 kbps modes, multiple audio tracks, and separately processed timeline segments.

### Privacy and network behavior

The fork contains privacy-related modifications documented in [`PRIVACY-CHANGES.md`](PRIVACY-CHANGES.md). These include a default-off application network setting and removal of selected upstream online integrations, GPS map functionality, and related dependencies.

### Other inherited functionality

The video editing, timeline, stream handling, FFmpeg integration, translations, documentation, and much of the desktop application structure are inherited from LosslessCut. Their upstream copyright and license notices must remain intact.

## Product identity after the SwiftCut rebrand

The following runtime and platform identities have been changed from the upstream values:

- Electron application and product name: `SwiftCut`.
- Package/workspace name: `swiftcut`.
- Electron Builder application ID and macOS bundle ID: `com.swiftcut.desktop`.
- Windows AppX application identity: `SwiftCut` (the inherited publisher certificate identity is retained and is not a SwiftCut-owned publisher identity).
- Linux executable, desktop entry, and AppStream ID: `swiftcut`, `swiftcut.desktop`, and `com.swiftcut.desktop`.
- Application icon: the approved tropical beach and palm-tree illustration, generated into the platform icon formats by `script/generateIcon.ts`.

The rebrand is intentionally destructive for this single-user development build. Electron's user-data directory now follows the SwiftCut application name; old LosslessCut settings are not migrated. The `.llc` project extension is retained.

The following upstream references remain intentionally unchanged until SwiftCut-owned destinations exist:

- Original copyright notices, GPL license, and source-provenance references.
- The upstream source repository URL and support email used by inherited Help links.
- The upstream documentation website and its redirect structure.
- Historical upstream release notes and the inherited `website/` source tree.
- Publisher certificate and signing-related values inherited from the upstream project. These do not establish SwiftCut's own store identity.

The inherited release and website workflows remain guarded against publishing from a SwiftCut repository. Do not publish store packages or signed installers until new signing identities, provisioning profiles, publisher information, and SwiftCut-owned repository/support destinations have been configured and tested.

## License and attribution

The upstream project is licensed under GPL-2.0-only. This derivative project retains that license and the upstream `LICENSE` file. Do not remove upstream copyright notices or relicense the combined derivative work under an incompatible license.

Review the licenses and attribution requirements for all third-party dependencies and bundled assets before distributing binaries.
