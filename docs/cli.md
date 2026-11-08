# Command line interface (CLI)

This guide describes SwiftCut, a customized build based on LosslessCut. Links to upstream source and issue discussions are retained as provenance and may describe upstream-only behavior.

SwiftCut has basic support for automation through the CLI. See also [HTTP API](api.md).

```bash
swiftcut [options] [files]
```

Note that these examples assume that you have set up the SwiftCut executable to be available in your `PATH` (command line environment). Alternatively you can run it like this:

```bash
# First navigate to the folder containing the SwiftCut app
cd /path/to/directory/containing/app
# Then run it
# On Linux:
./swiftcut arguments
# On Windows (PowerShell):
.\SwiftCut.exe arguments
# On MacOS:
./SwiftCut.app/Contents/MacOS/SwiftCut arguments
```

SwiftCut does not currently publish a Windows Store package. Use the executable from your local build.

## Open one or more files:
```bash
swiftcut file1.mp4 file2.mkv
```

## Override settings (experimental) 🧪

See [available settings](https://github.com/mifi/lossless-cut/blob/master/src/main/configStore.ts). Note that this is subject to change in newer versions. Settings are validated, and if the JSON or any key or value is invalid, none of them are applied (see the log for details). You may use JSON or JSON5. Example:
```bash
swiftcut --settings-json '{captureFormat:"jpeg", "keyframeCut":true}'
```

### Override FFmpeg/FFprobe path

Overriding path to FFmpeg/FFprobe can be done in the UI, or with the following command:

```bash
swiftcut --settings-json '{customFfPath:"/path/to/folder/containing/ffmpeg_and_ffprobe"}'
```

## Other options

- `--locales-path` Customise path to locales (useful for [translators](translation.md)).
- `--disable-networking` Make app completely offline (see [#1418](https://github.com/mifi/lossless-cut/issues/1418)).
- `--http-api` Start the [HTTP server with an API](api.md) to control SwiftCut, optionally specifying a port (default `8080`).
- `--keyboard-action` Run a keyboard action (see below.)
- `--config-dir` Path to a directory where the `config.json` file will be stored and loaded from. Note: don't include `config.json` in the path (only the directory containing it).

## Controlling a running instance (experimental) 🧪

If you have the "Allow multiple instances" setting disabled (the default), you can control a running instance of SwiftCut from the outside, using for example a command line. You do this by issuing messages to it through the `swiftcut` command. Currently only keyboard actions are supported, and you can open files. *Note that this is considered experimental and the API may change at any time.*

### Open files in running instance

```bash
swiftcut file1.mp4 file2.mkv
```

### Keyboard actions, `--keyboard-action`

Simulate a keyboard press action in an already running instance of SwiftCut (if none is running, or "Allow multiple instances" is enabled, the action is ignored). Arguments are JSON or JSON5. **Note that the command will return immediately**, so if you want to run multiple actions in a sequence, you have to `sleep` for a few seconds between the commands. Alternatively if you want to wait until an action has finished processing, use the [HTTP API](api.md) instead.

### Available keyboard actions

A list of the available action names can be found in the "Keyboard shortcuts" dialog in the app. Note that you don't have to bind them to any key before using them.

#### Example keyboard actions

Open a file and export it:
```bash
# Open a file in an already running instance
swiftcut file.mp4
sleep 3 # hopefully the file has loaded by now
# Export the currently opened file
swiftcut --keyboard-action export
```

Seek to specific time in the media:
```bash
swiftcut --keyboard-action goToTimecodeDirect '{"time": "12.23"}'
```

### Actions that open a dialog cannot be scripted

Some actions, for example `createNumSegments`, `createFixedDurationSegments` or `selectSegmentsByExpr`, open a dialog where you have to enter something. These cannot be fully automated, because there's no way to pass the dialog's values from the command line: the action will just open the dialog in the app.

Instead, to create segments from a script, write a [project file](index.md#importexport-projects) next to the media file. If the media file is `/path/to/video.mp4`, name the project file `/path/to/video-proj.llc`, and SwiftCut will load it automatically when you open the media file. Times are in seconds, `name` is the segment label:

```json5
{
  version: 2,
  mediaFileName: 'video.mp4',
  cutSegments: [
    { start: 0, end: 10, name: 'First' },
    { start: 20, end: 30, name: 'Second' },
  ],
}
```

Then open the file and export it using `--keyboard-action export`, or better the [HTTP API](api.md), which waits for most actions to finish before responding. Note that by default `export` first opens the export options dialog, so either turn that dialog off (`--settings-json '{exportConfirmEnabled:false}'`) or send `export` twice. You can also open an `.llc` file directly (`swiftcut /path/to/video-proj.llc`), see the [batch example](api.md#batch-example).

### HTTP API

You can also control a running instance with the [HTTP API](api.md).
