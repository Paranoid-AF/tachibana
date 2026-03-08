# @tachibana/ios-connect - iOS Device Management Native Addon

## Purpose

Unified package providing:

- **iOS device management** (via napi-rs native addon) - device listing, app installation, screenshots, photos, USB tunneling
- **App signing & installation** - Apple auth, code signing, cert management, device installation via `isideload`
- **Renewal system** - automatic re-signing before certificates expire

## Architecture

```
Before: TypeScript → spawn(kani-isideload) → JSON-RPC stdin/stdout → Rust
After:  TypeScript → require('./index.js') → .node addon → Rust (direct calls)
```

```
core/                        # Rust cdylib crate (kani-isideload)
├── src/
│   ├── lib.rs               # napi entry: Session class + module-level fns
│   ├── session.rs           # SessionState (account + dev_session + config)
│   └── commands/
│       ├── auth.rs          # login (with ThreadsafeFunction 2FA callback)
│       ├── teams.rs         # list teams
│       ├── certs.rs         # list / revoke certs
│       ├── app_ids.rs       # list / create app IDs
│       ├── devices.rs       # list (portal) / list_connected (usbmuxd) / register
│       ├── sideload.rs      # sign / install app
│       ├── screenshots.rs   # screenshot via idevice screenshotr
│       ├── photos.rs        # AFC photo library access with pagination
│       └── pairing.rs       # pair / validate pairing via lockdownd
├── build.rs                 # napi_build::setup() + TYPE_DEF_TMP_PATH bridge
└── Cargo.toml               # cdylib, napi = {serde-json, tokio_rt, napi4}

src/
├── isideload/
│   ├── native.ts            # loads ./index.js via createRequire; TS interfaces
│   ├── session.ts           # singleton Session instance manager
│   └── commands/
│       ├── auth.ts          # login: passes JS async callback to session.login()
│       ├── install.ts       # sign + install pipeline
│       ├── cert.ts          # cert listing / revocation
│       ├── team.ts          # team listing
│       ├── app-id.ts        # app ID management
│       ├── device.ts        # connected device listing (usbmuxd)
│       ├── screenshot.ts    # screenshot capture
│       ├── photos.ts        # photo library access
│       └── tunnel.ts        # USB tunneling (stub, planned)
├── wda/                     # WebDriverAgent client
├── renewal/                 # Certificate renewal system
│   ├── store.ts
│   ├── manager.ts
│   └── scheduler.ts
├── utils/
│   ├── ipa.ts
│   ├── bundleId.ts
│   └── plist.ts
├── types.ts
├── errors.ts
└── index.ts                 # Barrel exports

index.js                     # @napi-rs/cli generated platform loader (DO NOT EDIT)
index.d.ts                   # @napi-rs/cli generated TypeScript types (DO NOT EDIT)
kani-isideload.darwin-arm64.node  # compiled native addon (gitignored)
```

## Build

```bash
# Build native addon (runs automatically on bun install via postinstall)
bun run scripts/build-native.ts

# Or directly:
bunx @napi-rs/cli build --platform --release --manifest-path core/Cargo.toml --output-dir .

# Skip native build (use pre-built .node):
SKIP_NAPI_BUILD=1 bun install
```

The `build.rs` bridges `NAPI_TYPE_DEF_TMP_FOLDER` (set by @napi-rs/cli v3) to
`TYPE_DEF_TMP_PATH` (read by napi-derive proc macro) so TypeScript definitions
are generated correctly.

## Key Design Decisions

- **2FA callback**: Rust receives a `ThreadsafeFunction<serde_json::Value>` from JS.
  Inside the `isideload` sync closure, `Handle::current().block_on()` resolves the
  JS `Promise<string>` synchronously.
- **serde-json napi feature**: Required for `serde_json::Value` ↔ JS value bridging.
- **`cdylib` only**: No standalone binary. The crate compiles only as a native addon.
- **Platform targets**: macOS (arm64/x64), Linux glibc/musl (arm64/x64), Windows MSVC (arm64/x64).

## Session Lifecycle

```typescript
import { configureSession } from '@tachibana/ios-connect'

configureSession({ dataDir: '/path/to/data', anisetteUrl: 'wss://...' })
// Session is lazily created on first use via getSession() in each command
```
