# SwiftCut — Windows Development Environment Setup

This guide describes how to prepare **SwiftCut on Windows 11 x64** for local development. **FFmpeg and Electron binaries are downloaded manually in a browser** and copied into the project; neither binary is downloaded with a dedicated CLI download command.

**Requirements:** Git, Node.js 24, PowerShell, and an existing clone of the SwiftCut repository. The commands below assume the repository is located at `E:\Projects\SwiftCut`; substitute your own path if necessary.

## 1. Install Yarn and project dependencies

SwiftCut uses **Yarn 4.18.0** through Corepack.

```powershell
# Install and enable Corepack
npm install -g corepack
corepack enable

# Open the project and check Yarn
cd E:\Projects\SwiftCut
yarn --version

# Install JavaScript project dependencies
yarn install --immutable
```

> **Important:** Install the project dependencies **before** manually copying the Electron binaries. A later dependency reinstall may replace `node_modules/electron`. Yarn may try to download Electron during its install step; if that binary download fails, follow Section 3 to complete Electron's installation manually.

## 2. Download and install FFmpeg manually

**Only use the BtbN Windows x64 GPL Shared build.** Do not substitute a static build, an LGPL build, or binaries from another distributor.

1. Open [BtbN / FFmpeg-Builds — Releases](https://github.com/BtbN/FFmpeg-Builds/releases) in a browser.
2. Download the Windows x64 **GPL Shared** ZIP, typically named `ffmpeg-master-latest-win64-gpl-shared.zip`.
3. Extract the ZIP archive.
4. Open its `bin\` folder and copy **all files inside that folder** into:

   ```text
   E:\Projects\SwiftCut\ffmpeg\win32-x64\lib\
   ```

Copy the **contents of `bin\`**, not the `bin\` directory itself. This includes `ffmpeg.exe`, `ffprobe.exe` and **all accompanying DLLs** required by the shared build.

Expected layout (illustrative):

```text
SwiftCut/
└── ffmpeg/
    └── win32-x64/
        └── lib/
            ├── ffmpeg.exe
            ├── ffprobe.exe
            ├── ffplay.exe
            ├── avcodec-*.dll
            ├── avformat-*.dll
            ├── avutil-*.dll
            └── other shared-library DLLs
```

Verify the manually installed binaries:

```powershell
cd E:\Projects\SwiftCut
.\ffmpeg\win32-x64\lib\ffmpeg.exe -version
.\ffmpeg\win32-x64\lib\ffprobe.exe -version
```

**Do not run** `yarn download-ffmpeg-win32-x64` for this manual setup.

## 3. Download and install Electron manually

The version currently resolved by the repository's Yarn lockfile is **Electron 45.0.0**. Check `yarn.lock` if dependencies are upgraded in the future; the ZIP must match the installed Electron npm package version and the Windows x64 architecture.

1. Open [Electron v45.0.0 — GitHub Releases](https://github.com/electron/electron/releases/tag/v45.0.0) in a browser.
2. Download `electron-v45.0.0-win32-x64.zip`.
3. Extract the ZIP archive.
4. Copy **all extracted files and folders** into:

   ```text
   E:\Projects\SwiftCut\node_modules\electron\dist\
   ```

The `electron.exe` file must be directly inside `dist\`; do not put another `electron-v45.0.0-win32-x64\` folder between `dist\` and the executable.

Expected layout (illustrative):

```text
SwiftCut/
└── node_modules/
    └── electron/
        ├── install.js
        ├── index.js
        ├── package.json
        ├── path.txt                 # Create this file below
        └── dist/
            ├── electron.exe
            ├── resources/
            ├── locales/
            ├── icudtl.dat
            ├── *.pak
            ├── *.dll
            └── other Electron files
```

The Electron npm package requires a `path.txt` file containing the executable's path relative to `dist\`. Create it **after copying the ZIP contents**:

```powershell
cd E:\Projects\SwiftCut

Set-Content `
  -Path .\node_modules\electron\path.txt `
  -Value "electron.exe" `
  -NoNewline `
  -Encoding ascii
```

Verify both the executable and the locator file:

```powershell
Test-Path .\node_modules\electron\dist\electron.exe
Test-Path .\node_modules\electron\path.txt
yarn electron --version
```

Both `Test-Path` commands should return `True`. For the current lockfile, Electron should report `v45.0.0`.

**Troubleshooting — `Error: Electron uninstall`:** If the Vite renderer starts but the Electron window does not, confirm that both `dist\electron.exe` and `path.txt` exist, and that `path.txt` contains exactly `electron.exe`. This problem indicates an incomplete local Electron binary installation, not necessarily a SwiftCut source-code error.

## 4. Run or compile the development version

### Option A: Start the live development server (recommended)

```powershell
cd E:\Projects\SwiftCut
git switch main
git pull origin main
yarn dev
```

The Electron renderer development server will start, and the desktop application should open.

### Option B: Build and preview locally

```powershell
cd E:\Projects\SwiftCut

# Type-check
yarn tsc

# Compile Electron main/preload/renderer output
yarn build

# Start the built application in preview mode
yarn start
```

The compilation output is primarily written under `out\`. **This does not create a standalone portable ZIP or installer.**

## Quick reference

| Step | Action |
| --- | --- |
| 1 | Install Corepack/Yarn and run `yarn install --immutable` |
| 2 | Manually copy the **entire contents** of BtbN GPL Shared `bin\` into `ffmpeg\win32-x64\lib\` |
| 3 | Manually copy Electron's entire ZIP contents into `node_modules\electron\dist\`; create `path.txt` |
| 4 | Run `yarn dev` |

For normal subsequent development sessions:

```powershell
cd E:\Projects\SwiftCut
yarn dev
```
