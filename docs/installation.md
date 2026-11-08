# Installation and files

## Development build

SwiftCut is currently a private development build. There are no official SwiftCut installers or store releases. Follow the development and packaging instructions in the repository [README](../README.md) to build it locally.

The application is not a portable app. Settings, keyboard shortcuts, logs and temporary cache files are stored in Electron's `appData` folder.

## Settings and temporary files

| OS | `appData` folder path |
|---|---|
| Windows | `%APPDATA%\SwiftCut` |
| macOS | `~/Library/Application Support/SwiftCut` |
| Linux | `$XDG_CONFIG_HOME/SwiftCut` or `~/.config/SwiftCut` |

App settings and keyboard shortcuts are stored inside the `config.json` file in the `appData` folder.

**Important:** the SwiftCut rebrand intentionally uses a new application name and user-data directory. Existing LosslessCut settings are not migrated automatically.

### Copy SwiftCut settings to another computer

Quit SwiftCut on both computers, then copy `config.json` from the `appData` folder on the old computer to the same folder on the new computer. Settings containing paths (for example, a custom working directory or FFmpeg path) may need to be adjusted if the folders differ.

### Custom `config.json` path

On Windows, if you create a `config.json` file containing `{}` next to `SwiftCut.exe`, SwiftCut will read and store settings there instead of in the default `appData` folder. Other temporary files will still be stored in `appData`. Alternatively, specify a custom path to a folder containing `config.json` with the [CLI option](cli.md) `--config-dir`.

## How to uninstall

Delete the application folder that you extracted when installing the development build.

To also remove settings, logs and caches, delete the `appData` folder listed above.

## Upstream compatibility

SwiftCut is a customized derivative of LosslessCut. Its inherited media-editing behavior remains subject to the upstream project's format and codec limitations. SwiftCut-specific support and public distribution channels have not yet been established.
