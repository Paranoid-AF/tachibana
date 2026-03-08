# @tbana/ios-wda

WebDriverAgent IPA builder and bundler for iOS device automation.

## Features

- **Automatic build on install** - Downloads and builds WebDriverAgent IPA during package installation
- **Unsigned IPA generation** - Builds unsigned IPA for real iOS devices, ready for signing with `@tbana/ios-connect`
- **Path resolution API** - Exports IPA path via environment variable or bundled asset
- **Graceful fallback** - Skips build if Xcode is unavailable without blocking installation
- **Version control** - Configurable WDA version via environment variable

## What is WebDriverAgent?

WebDriverAgent (WDA) is a WebDriver server for iOS that enables remote control and inspection of iOS applications and devices. It's required for:

- UI automation and testing
- Remote device control
- App inspection and debugging
- Screenshot capture
- Element interaction

This package automates the process of building an unsigned WDA IPA that can be signed with your Apple Developer credentials and installed on real iOS devices.

## Installation

```bash
bun add @tbana/ios-wda
```

### Build Requirements

- **macOS** (Xcode only available on Mac)
- **Xcode 13+** (for iOS 15+ support)
- **Xcode Command Line Tools** installed

If Xcode is not available, the package will still install successfully but skip building the IPA. You can provide a custom IPA path via environment variable.

### First Install

The first install will:

1. Download `appium-webdriveragent@11.1.4` tarball (~30MB)
2. Build unsigned IPA using `xcodebuild` (2-5 minutes)
3. Bundle IPA in `ipa-build/WebDriverAgentRunner.ipa` (~15MB)

Subsequent installs are instant (cached IPA).

## Quick Start

### Get WebDriverAgent IPA Path

```typescript
import { getWdaIpaPath } from '@tbana/ios-wda'

// Get IPA path (throws if not found)
const ipaPath = getWdaIpaPath()
console.log('WDA IPA:', ipaPath)
// → /path/to/packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa
```

### Sign and Install with @tbana/ios-connect

```typescript
import { wda } from '@tbana/ios-wda'
import { sideloader } from '@tbana/ios-connect'

// Get unsigned WDA IPA
const unsignedWda = wda.getWdaIpaPath()

// Sign and install on device using Sideloader CLI
await sideloader.install({
  ipaPath: unsignedWda,
  deviceUdid: 'your-device-udid',
})
```

### Path Resolution with Metadata

```typescript
import { resolveWdaIpa } from '@tbana/ios-wda'

const resolution = resolveWdaIpa()
console.log(resolution)
// → { path: '/path/to/WebDriverAgentRunner.ipa', source: 'bundled' }

// Possible sources:
// - 'env': From WDA_IPA_PATH environment variable
// - 'bundled': From ipa-build/WebDriverAgentRunner.ipa
```

## Environment Variables

### `SKIP_WDA_BUILD`

Skip building WDA during package installation:

```bash
SKIP_WDA_BUILD=1 bun install
```

**Use when:**

- You already have a built IPA
- Xcode is not available
- You want faster installation

### `WDA_IPA_PATH`

Use a custom WebDriverAgent IPA file:

```bash
export WDA_IPA_PATH=/path/to/custom/WebDriverAgentRunner.ipa
```

**Use when:**

- You have a pre-built IPA
- You built WDA manually
- You want to use a specific WDA version

### `WDA_VERSION`

Override the appium-webdriveragent version to download and build:

```bash
WDA_VERSION=11.0.0 bun install
```

**Default:** `11.1.4`

## API Reference

### Functions

#### `getWdaIpaPath(): string`

Returns the absolute path to the WebDriverAgent IPA file.

**Returns:** `string` - Absolute path to IPA

**Throws:** `WdaIpaNotFoundError` if IPA cannot be found

**Example:**

```typescript
const ipaPath = getWdaIpaPath()
```

#### `resolveWdaIpa(): WdaResolution`

Resolves the IPA path with metadata about the resolution source.

**Returns:** `{ path: string, source: 'env' | 'bundled' }`

**Throws:** `WdaIpaNotFoundError` if IPA cannot be found

**Example:**

```typescript
const { path, source } = resolveWdaIpa()
console.log(`Using ${source} IPA at ${path}`)
```

### Types

#### `WdaResolution`

```typescript
interface WdaResolution {
  path: string // Absolute path to IPA
  source: 'env' | 'bundled' // Resolution source
}
```

#### `WdaVersionInfo`

```typescript
interface WdaVersionInfo {
  wdaVersion: string // e.g., "11.1.4"
  builtAt: string // ISO timestamp
  xcodeVersion?: string // e.g., "15.2"
}
```

#### `XcodeInfo`

```typescript
interface XcodeInfo {
  available: boolean // Xcode is installed
  version?: number // e.g., 15.2
  tooOld?: boolean // Version < 13.0
}
```

### Errors

#### `WdaIpaNotFoundError`

Thrown when the IPA file cannot be found.

**Solutions:**

- Run `bun install` in the package directory
- Provide custom IPA via `WDA_IPA_PATH`
- Check that `ipa-build/WebDriverAgentRunner.ipa` exists

#### `WdaDownloadError`

Thrown when downloading the WDA tarball fails after retries.

#### `WdaBuildError`

Thrown when `xcodebuild` fails. Includes `stderr` property with build output.

## Build Process

The postinstall script performs these steps:

1. **Check environment:**
   - Skip if `SKIP_WDA_BUILD=1` is set
   - Skip if IPA already exists in `ipa-build/`

2. **Validate Xcode:**
   - Check if `xcodebuild` is available
   - Verify version is 13.0 or higher
   - Exit gracefully if missing or too old

3. **Download WebDriverAgent:**
   - Fetch tarball from npm registry
   - Retry up to 3 times with exponential backoff
   - Extract to temporary directory

4. **Build unsigned IPA:**
   - Create `ExportOptions.plist` with manual signing config
   - Run `xcodebuild clean`
   - Run `xcodebuild archive` with unsigned configuration:
     - Target: `iphoneos` SDK (real devices)
     - Scheme: `WebDriverAgentRunner`
     - Code signing: **disabled** (`CODE_SIGN_IDENTITY=""`)
   - Export archive to IPA without signing

5. **Bundle and cleanup:**
   - Copy IPA to `ipa-build/WebDriverAgentRunner.ipa`
   - Write version metadata to `ipa-build/wda-version.json`
   - Remove temporary files

### Build Output

**ipa-build/WebDriverAgentRunner.ipa:**

- Unsigned IPA for real iOS devices
- Size: ~10-20MB
- Architecture: Universal (arm64)

**ipa-build/wda-version.json:**

```json
{
  "wdaVersion": "11.1.4",
  "builtAt": "2026-02-10T12:34:56.789Z",
  "xcodeVersion": "15.2"
}
```

## Architecture

```
packages/ios-wda/
├── package.json           # Postinstall hook triggers build
├── scripts/
│   ├── postinstall.ts     # Main orchestrator
│   ├── check-xcode.ts     # Xcode availability check
│   ├── resolve-wda-package.ts  # Resolve WDA package path
│   └── build-wda.ts       # Build unsigned IPA with xcodebuild
├── src/
│   ├── index.ts           # Barrel exports
│   ├── resolver.ts        # Path resolution (env → bundled)
│   ├── types.ts           # TypeScript definitions
│   └── errors.ts          # Error classes
└── ipa-build/             # Generated during install (not in git)
    ├── WebDriverAgentRunner.ipa
    └── wda-version.json
```

### Path Resolution Priority

1. **`WDA_IPA_PATH` environment variable** - Custom IPA path
2. **Bundled IPA** - `ipa-build/WebDriverAgentRunner.ipa`
3. **Throw error** - `WdaIpaNotFoundError`

## Troubleshooting

### Xcode Not Found

```
[ios-wda] ⚠️  Xcode Command Line Tools not found
```

**Solution:**

```bash
xcode-select --install
```

Or install full Xcode from Mac App Store.

### Xcode Too Old

```
[ios-wda] ⚠️  Xcode 12.5 is too old (13.0+ required)
```

**Solution:** Update Xcode to version 13 or later from Mac App Store.

### Build Failed

```
[ios-wda] ✗ Build failed: Archive build failed
```

**Solutions:**

1. Check Xcode version:

   ```bash
   xcodebuild -version
   ```

2. Manually rebuild:

   ```bash
   cd packages/ios-wda
   rm -rf ipa-build
   bun install
   ```

3. Use pre-built IPA:

   ```bash
   export WDA_IPA_PATH=/path/to/WebDriverAgentRunner.ipa
   ```

4. Skip build:
   ```bash
   SKIP_WDA_BUILD=1 bun install
   ```

### IPA Not Found at Runtime

```
WdaIpaNotFoundError: WebDriverAgent IPA not found
```

**Solutions:**

1. Run postinstall manually:

   ```bash
   cd packages/ios-wda
   bun run scripts/postinstall.ts
   ```

2. Check if IPA exists:

   ```bash
   ls -lh ipa-build/WebDriverAgentRunner.ipa
   ```

3. Provide custom IPA:
   ```bash
   export WDA_IPA_PATH=/path/to/custom.ipa
   ```

### Verify Unsigned IPA

To confirm the IPA is unsigned:

```bash
codesign -dv packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa
```

Should show no code signature or identity.

## Credits & Dependencies

### Core Dependencies

- **[appium-webdriveragent](https://github.com/appium/WebDriverAgent)** (Appium Project)
  WebDriver server implementation for iOS. Downloaded from npm registry at install time and built into an unsigned IPA using Xcode command-line tools.

- **[tar](https://github.com/isaacs/node-tar)** (^7.4.3, Isaac Z. Schlueter)
  TAR archive extraction library. Used to extract the appium-webdriveragent tarball downloaded from npm.

### Build Tools

- **Xcode** (Apple)
  Required for building the IPA. Uses `xcodebuild` command-line tool to compile WebDriverAgent for iOS devices without code signing.

## Integration

This package is designed to work seamlessly with the Tbana ecosystem:

### Server Integration

```typescript
// apps/server/src/ios.ts
import * as wda from '@tbana/ios-wda'

export const ios = {
  // ... other modules
  wda,
}
```

### Usage in Routes

```typescript
import { ios } from './ios.ts'

app.get('/wda/info', () => {
  const resolution = ios.wda.resolveWdaIpa()
  return {
    path: resolution.path,
    source: resolution.source,
  }
})
```

## Performance

**Install Time:**

- First install: 2-5 minutes (download + build)
- Subsequent installs: <1 second (cached IPA)
- With `SKIP_WDA_BUILD=1`: instant

**Runtime:**

- IPA resolution: O(1), simple file path check
- No network calls at runtime
- No subprocess spawning

**Storage:**

- Downloaded tarball: ~30MB (temporary, cleaned up)
- Built IPA: ~15MB (permanent in ipa-build/)

## Disclaimer

This package downloads and builds WebDriverAgent from the official Appium project. WebDriverAgent is used for iOS device automation and requires a valid Apple Developer account for signing and installation on real devices.

The unsigned IPA produced by this package cannot be installed directly on devices and must be signed with valid Apple Developer credentials using tools like `@tbana/ios-connect` (Sideloader CLI).

**Apple Developer Account Limitations:**

Free developer accounts have Apple-enforced constraints:

- Maximum 2 active development certificates
- 7-day certificate expiry
- Limited app IDs

Use the `@tbana/ios-connect` package's renewal system to handle these limitations automatically.

## Related Packages

- `@tbana/ios-connect` - iOS device management, Sideloader-based signing, and certificate renewal
- `@tbana/server` - Elysia server exposing iOS management APIs
- `@tbana/shared` - Shared types and utilities

## License

See the root [LICENSE](../../LICENSE) file.

## Documentation

For detailed documentation, see [CLAUDE.md](./CLAUDE.md).
