# Privacy and network-control changes

This fork removes several upstream behaviors that are not needed for local video/audio editing.

## Removed

- Central promotional iframe/link and its remote configuration loader (from the earlier customization).
- GPS map dialog, OpenStreetMap tile requests, DJI GPS map parsers, and Leaflet dependencies. Generic subtitle/data-track handling remains.
- Automatic GitHub release-version check and its Settings option.
- Automatic React Developer Tools download during development.
- Microsoft Store identity/reporting request (`losslesscut-analytics` endpoint).
- The `ky` dependency, which was used only by the removed store-identity request.

## Network setting

- New persistent setting: `allowNetworkConnections`.
- Default: `false` (network disabled).
- The setting is available under Settings > Advanced settings.
- Electron renderer HTTP(S)/WebSocket requests are blocked while disabled. Loopback is permitted only in development mode for the local Vite server/HMR.
- FFmpeg and FFprobe invocations are checked for common network input protocols and rejected while network access is disabled.
- The existing `--disable-networking` command-line flag remains a force-disable override.
- Explicitly opening a link through the system browser remains available; the external browser is outside the application's network control.

## Preserved

- Local file import, preview, stream inspection, segment editing, cutting, merging, audio extraction, and FFmpeg processing.
- Generic subtitle parsing and handling of non-copyable telemetry/data tracks. GPS metadata preservation behavior is not intentionally changed.
- Original copyright notices and GPL-2.0-only licensing.

## Validation status

Static source checks were performed for removed feature references and package manifest validity. A full TypeScript build, test suite, Windows runtime test, and packet-capture test have not yet been run in this environment. After extracting this source, run the project install/build/test commands on Windows and verify network behavior with the application network setting both off and on.

The network setting is application-level control, not a replacement for Windows Firewall. It governs Electron session requests and FFmpeg/FFprobe network-protocol inputs; it cannot control the external browser or unrelated operating-system services.
