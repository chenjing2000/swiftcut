# Releasing SwiftCut

## Current status

**SwiftCut is not yet configured for public binary or store distribution.**

The runtime product name, application IDs, executable names, Linux desktop metadata, and application icon now use SwiftCut branding. The source repository, support links, website, publisher certificates, and parts of the store-signing configuration remain inherited from LosslessCut. The inherited release workflows remain guarded and are not a SwiftCut release pipeline.

Do not create or publish a SwiftCut release, store submission, signed installer, or public website until the checklist below has been completed and reviewed.

## Required work before the first public release

1. Establish the official SwiftCut GitHub repository and update `package.json` repository metadata and in-app source-code links.
2. Replace upstream support email, documentation, donation, and release links with SwiftCut-owned destinations where applicable.
3. Configure a new Windows signing/publisher identity if a signed installer or Microsoft Store package is required.
4. Register the new Apple Developer bundle identifier and App Group, then provide matching provisioning profiles, certificates, and notarization settings before building macOS or Mac App Store packages. The inherited upstream credentials must not be reused as SwiftCut credentials.
5. Rebrand and review the inherited website before enabling website deployment.
6. Review GPL-2.0-only obligations and generate a complete third-party license report.
7. Build and test Windows packages on a clean machine. Test installation, uninstall, the new SwiftCut user-data location, FFmpeg availability, audio extraction, and cancellation. Existing LosslessCut settings are intentionally not migrated.
8. Create a SwiftCut-specific release workflow only after the repository and signing configuration are ready. Publishing still requires explicit approval.

## Current development validation

Before preparing a future release candidate, run:

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run
node .yarn\releases\yarn-4.18.0.cjs build
node .yarn\releases\yarn-4.18.0.cjs check-licenses
```

Also perform manual Windows GUI testing with real MP4 files, including multi-track extraction, multiple segments, existing-output protection, and cancellation during an active task.

## Upstream release configuration

LosslessCut-derived workflows and scripts are retained only as source references where needed. They are guarded or disabled for SwiftCut and must not be treated as an approved SwiftCut release process.
