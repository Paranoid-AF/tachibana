# @kaniapp/ios-connect - iOS Device Management & Sideloader

## Purpose

Unified package providing:

- **iOS device management** (via kani-isideload daemon) - device listing, app installation, tunneling, screenshots
- **App signing & installation** (via Sideloader CLI) - Apple auth, code signing, cert management, device installation
- **Renewal system** - automatic re-signing before certificates expire

Replaces the previous `@kaniapp/ios-signer` package. Uses [Sideloader](https://github.com/Dadoum/Sideloader) which bundles ADI-based auth, code signing, cert management, and device installation in one tool.

## Architecture

```
src/
├── isideload/           # kani-isideload daemon wrapper
│   ├── commands/
│   │   ├── device.ts    # Connected device listing
│   │   ├── install.ts   # Full pipeline: auth + sign + install
│   │   ├── cert.ts      # Certificate management
│   │   ├── team.ts      # Team listing
│   │   ├── app-id.ts    # App ID management
│   │   ├── tunnel.ts    # Tunneling
│   │   ├── screenshot.ts # Screenshots
│   │   └── photos.ts    # Photo library access
│   └── daemon.ts        # Daemon lifecycle (getDaemon, stopDaemon, etc.)
├── wda/                 # WebDriverAgent client
├── renewal/             # Certificate renewal system
│   ├── store.ts         # Signing records persistence
│   ├── manager.ts       # Renewal logic
│   └── scheduler.ts     # Periodic renewal timer
├── utils/
│   ├── ipa.ts           # IPA metadata extraction
│   ├── bundleId.ts      # Bundle ID generation
│   └── plist.ts         # Plist parsing
├── types.ts             # Shared type definitions
├── errors.ts            # Error classes
└── index.ts             # Barrel exports
```

## Dependencies

- `plist` - Apple plist parsing and generation
- kani-isideload - Built from Rust source via `scripts/build-native.ts`
- Sideloader CLI - Downloaded via `scripts/download.ts` using `gh` CLI

## Binary Resolution

kani-isideload and sideloader follow the same resolution pattern:

1. Explicit env var override
2. Bundled binary in package `bin/` directory
3. Compiled mode: sibling `bin/` to executable
4. PATH fallback
