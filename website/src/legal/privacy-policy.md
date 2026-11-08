# Privacy policy

This customized LosslessCut build is designed to process media locally on your computer. It does not include analytics, telemetry, automatic update checks, automatic extension downloads, GPS map tiles, or the upstream store-identity reporting request.

## Network access control

Network access is disabled by default. When disabled, the application blocks external HTTP and HTTPS requests made by its Electron renderer and rejects network-protocol inputs passed to FFmpeg or FFprobe. Local files and the local development server remain available.

When you explicitly enable network access in Settings, online media sources and other application features that require network access may work. The application still does not add analytics, telemetry, or automatic uploads.

When you explicitly open a help or website link, it is handed to your system's external browser. The browser then operates under its own settings and the destination website's privacy policy; the application's network switch does not control the browser.

## Files and settings

Media files are processed locally. The application reads files and directories you explicitly open or select, and writes outputs, project files, logs, and settings as required by the actions you initiate and the configured application features. It does not intentionally scan unrelated folders or upload your media.

## Important limitation

The network switch controls requests made through the application's Electron session and network-capable FFmpeg/FFprobe inputs. It is not an operating-system firewall and cannot govern network activity from other applications, the external browser, or every operating-system service. For strict machine-wide isolation, use Windows Firewall or an equivalent network control.
