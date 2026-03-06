# @kaniapp/ios-connect - iOS Device Management & Sideloader

## Purpose

Unified package providing:

- **iOS device management** (via go-ios wrapper) - device listing, app installation, tunneling, screenshots
- **App signing & installation** (via Sideloader CLI) - Apple auth, code signing, cert management, device installation
- **Renewal system** - automatic re-signing before certificates expire

Replaces the previous `@kaniapp/ios-signer` package. Uses [Sideloader](https://github.com/Dadoum/Sideloader) which bundles ADI-based auth, code signing, cert management, and device installation in one tool.

## Architecture

```
src/
├── go-ios/              # go-ios wrapper (from previous ios-signer)
│   ├── commands/
│   │   ├── device.ts    # list(), listDetailed(), info(), pair(), listen()
│   │   ├── app.ts       # install(), launch(), kill(), listApps()
│   │   ├── tunnel.ts    # startTunnel(), listTunnels()
│   │   └── screenshot.ts # screenshot()
│   ├── executor.ts      # exec(), execStream(), resolveBinary()
│   ├── types.ts
│   ├── errors.ts
│   └── index.ts
├── sideloader/          # Sideloader CLI wrapper
│   ├── binary.ts        # Binary resolution
│   ├── executor.ts      # Interactive executor (stdin piping for 2FA)
│   └── commands/
│       ├── install.ts   # Full pipeline: auth + sign + install
│       ├── cert.ts      # Certificate management
│       ├── device.ts    # Device registration with Apple
│       ├── appId.ts     # App ID management
│       └── team.ts      # Team listing
├── renewal/             # Certificate renewal system
│   ├── store.ts         # Signing records persistence
│   ├── manager.ts       # Renewal logic (uses sideloader install)
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

- `go-ios` (npm) - Pre-built Go CLI binary for iOS device communication
- `plist` - Apple plist parsing and generation
- Sideloader CLI - Downloaded via `scripts/download.ts` using `gh` CLI

## Binary Resolution

Both go-ios and sideloader follow the same resolution pattern:

1. Explicit env var override
2. Bundled binary in package `bin/` directory
3. Compiled mode: sibling `bin/` to executable
4. PATH fallback
