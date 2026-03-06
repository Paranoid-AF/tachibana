# @kaniapp/ios-wda - WebDriverAgent IPA Builder

## Purpose

Downloads and builds an unsigned WebDriverAgent IPA at install time for use with iOS devices. The IPA is bundled with node_modules and exported via path resolution for signing with `@kaniapp/ios-connect`.

WebDriverAgent (WDA) is required for iOS device automation, remote control, and inspection capabilities. It must be signed with Apple Developer credentials before installation on real devices.

## Architecture

```
packages/ios-wda/
├── package.json           # Minimal config with postinstall hook
├── tsconfig.json          # Extends root tsconfig
├── CLAUDE.md              # This file
├── scripts/
│   ├── postinstall.ts     # Orchestrates download and build
│   ├── resolve-wda-package.ts  # Resolves appium-webdriveragent package path
│   ├── build-wda.ts       # Builds unsigned IPA with xcodebuild
│   └── check-xcode.ts     # Validates Xcode availability
├── src/
│   ├── index.ts           # Barrel exports
│   ├── resolver.ts        # resolveWdaIpa(), getWdaIpaPath()
│   ├── types.ts           # Type definitions
│   └── errors.ts          # Error classes
└── ipa-build/             # Generated during postinstall (not in git)
    ├── WebDriverAgentRunner.ipa  # Built unsigned IPA (~15MB)
    └── wda-version.json          # Version metadata
```

### Path Resolution

The package exports `resolveWdaIpa()` following the binary resolution pattern from `@kaniapp/ios-connect`:

```typescript
import { wda } from '@kaniapp/ios-wda'

// Get IPA path with metadata
const resolution = wda.resolveWdaIpa()
// { path: '/path/to/WebDriverAgentRunner.ipa', source: 'bundled' }

// Or get just the path
const ipaPath = wda.getWdaIpaPath()
```

**Resolution priority:**

1. `WDA_IPA_PATH` environment variable (custom IPA)
2. Bundled IPA in `ipa-build/WebDriverAgentRunner.ipa`
3. Throw `WdaIpaNotFoundError`

## Installation

The postinstall hook runs automatically during `bun install`:

```bash
# From project root
bun install

# Or from package directory
cd packages/ios-wda
bun install
```

### Build Requirements

- **Xcode 13+** (for iOS 15+ support)
- **macOS** (Xcode only available on Mac)
- **Xcode Command Line Tools** installed

### First Install

The first install will:

1. Download `appium-webdriveragent@11.1.4` tarball (~30MB)
2. Extract to temporary directory
3. Build unsigned IPA using xcodebuild (2-5 minutes)
4. Copy IPA to `ipa-build/WebDriverAgentRunner.ipa` (~15MB)
5. Clean up temporary files

Subsequent installs are instant (cached IPA).

### Skipping Build

Set environment variable to skip building:

```bash
SKIP_WDA_BUILD=1 bun install
```

Or provide a pre-built IPA:

```bash
export WDA_IPA_PATH=/path/to/custom/WebDriverAgentRunner.ipa
bun install
```

## Build Process

The postinstall script performs these steps:

1. **Check environment**:
   - Skip if `SKIP_WDA_BUILD=1`
   - Skip if IPA already exists in `ipa-build/`

2. **Validate Xcode**:
   - Check if `xcodebuild` is available
   - Verify version is 13.0 or higher
   - Exit gracefully (no error) if missing or too old

3. **Download WDA**:
   - Fetch tarball from npm registry
   - Retry up to 3 times with exponential backoff
   - Extract to temporary directory

4. **Build unsigned IPA**:
   - Create `ExportOptions.plist` with manual signing configuration
   - Run `xcodebuild clean`
   - Run `xcodebuild archive` with:
     - Target: `iphoneos` SDK (real devices)
     - Scheme: `WebDriverAgentRunner`
     - Configuration: `Release`
     - Code signing: **disabled** (`CODE_SIGN_IDENTITY=""`, `CODE_SIGNING_REQUIRED=NO`)
   - Export archive to IPA without signing
   - Timeout: 5 minutes

5. **Copy and cleanup**:
   - Copy IPA to `ipa-build/WebDriverAgentRunner.ipa`
   - Write version metadata to `ipa-build/wda-version.json`
   - Remove temporary files

### Build Output

**ipa-build/WebDriverAgentRunner.ipa**:

- Unsigned IPA for real iOS devices
- Size: ~10-20MB
- Architecture: Universal (arm64)
- SDK: iphoneos

**ipa-build/wda-version.json**:

```json
{
  "wdaVersion": "11.1.4",
  "builtAt": "2026-02-10T12:34:56.789Z",
  "xcodeVersion": "15.2"
}
```

## Usage with Signing Pipeline

The unsigned IPA is designed to be signed with `@kaniapp/ios-connect` (Sideloader CLI) before installation:

```typescript
import { ios } from './ios.ts'

// Get unsigned WDA IPA
const unsignedWda = ios.wda.getWdaIpaPath()

// Sign and install on device using Sideloader
await ios.sideloader.install({
  ipaPath: unsignedWda,
  deviceUdid: 'device-udid',
})
```

## API Reference

### Functions

#### `resolveWdaIpa(): WdaResolution`

Resolves the WebDriverAgent IPA path with metadata about the resolution source.

**Returns:** `{ path: string, source: 'env' | 'bundled' }`

**Throws:** `WdaIpaNotFoundError` if IPA cannot be found

#### `getWdaIpaPath(): string`

Convenience function that returns just the IPA path string.

**Returns:** `string` - Absolute path to IPA file

**Throws:** `WdaIpaNotFoundError` if IPA cannot be found

### Types

#### `WdaResolution`

```typescript
interface WdaResolution {
  path: string
  source: 'env' | 'bundled'
}
```

#### `XcodeInfo`

```typescript
interface XcodeInfo {
  available: boolean
  version?: number
  tooOld?: boolean
}
```

#### `WdaVersionInfo`

```typescript
interface WdaVersionInfo {
  wdaVersion: string
  builtAt: string
  xcodeVersion?: string
}
```

### Errors

#### `WdaError`

Base error class for all ios-wda errors.

#### `WdaIpaNotFoundError`

Thrown when the IPA file cannot be found. Check that:

- Postinstall ran successfully
- `ipa-build/WebDriverAgentRunner.ipa` exists
- Or `WDA_IPA_PATH` points to valid file

#### `WdaDownloadError`

Thrown when downloading the tarball fails after retries.

#### `WdaPackageNotFoundError`

Thrown when the `appium-webdriveragent` package cannot be resolved from `node_modules`.

#### `WdaBuildError`

Thrown when xcodebuild fails. Includes `stderr` property with build output.

## Environment Variables

### `SKIP_WDA_BUILD`

Skip building WDA during postinstall.

```bash
SKIP_WDA_BUILD=1 bun install
```

**Use when:**

- You already have a built IPA
- Xcode is not available
- You want faster installation

### `WDA_IPA_PATH`

Path to a custom WebDriverAgent IPA file.

```bash
export WDA_IPA_PATH=/path/to/WebDriverAgentRunner.ipa
```

**Use when:**

- You have a pre-built IPA
- You want to use a specific WDA version
- You built WDA manually

### `WDA_VERSION`

Override the appium-webdriveragent version to download.

```bash
WDA_VERSION=11.0.0 bun install
```

**Default:** `11.1.4`

## Troubleshooting

### Error: Xcode Not Found

```
[ios-wda] ⚠️  Xcode Command Line Tools not found
```

**Solution:**

```bash
xcode-select --install
```

Or install full Xcode from Mac App Store.

### Error: Xcode Too Old

```
[ios-wda] ⚠️  Xcode 12.5 is too old (13.0+ required)
```

**Solution:**
Update Xcode from Mac App Store to version 13 or later.

### Error: Build Failed

```
[ios-wda] ✗ Build failed: Archive build failed
```

**Solutions:**

1. Check Xcode version: `xcodebuild -version`
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

### Error: WdaIpaNotFoundError

```
WdaIpaNotFoundError: WebDriverAgent IPA not found
```

**Solutions:**

1. Run postinstall manually:
   ```bash
   cd packages/ios-wda
   bun run scripts/postinstall.ts
   ```
2. Check if `ipa-build/WebDriverAgentRunner.ipa` exists
3. Provide custom IPA via `WDA_IPA_PATH`

### Build Timeout

If the build times out after 5 minutes, it may indicate:

- Slow machine
- First Xcode build (downloads toolchain)
- Network issues (fetching dependencies)

**Solution:** Run build manually to see full output:

```bash
cd packages/ios-wda
rm -rf ipa-build
bun run scripts/postinstall.ts
```

### Verify IPA is Unsigned

To confirm the IPA is unsigned:

```bash
codesign -dv packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa
```

Should show no code signature or identity.

## Integration with Server

The server re-exports WDA through the unified iOS facade:

```typescript
// apps/server/src/ios.ts
import * as wda from '@kaniapp/ios-wda'

export const ios = {
  // ... other iOS modules
  wda,
}

export type { WdaResolution, WdaVersionInfo } from '@kaniapp/ios-wda'
```

**Usage in routes:**

```typescript
import { ios } from './ios.ts'

app.get('/wda/path', () => {
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
- Skip build: instant

**Runtime:**

- IPA resolution: O(1), simple file path check
- No network calls at runtime
- No subprocess spawning for resolution

**Storage:**

- Downloaded tarball: ~30MB (temporary, cleaned up)
- Extracted source: ~50MB (temporary, cleaned up)
- Built IPA: ~15MB (permanent in ipa-build/)
- Total package size after install: ~15MB

## Notes

- IPA is intentionally unsigned for integration with signing pipeline
- Built for real devices only (not iOS Simulator)
- Xcode 13+ required for iOS 15+ support
- Package follows all established monorepo patterns
- `ipa-build/` directory excluded from git (generated per-machine)
- Build is skipped gracefully on non-macOS platforms
- Supports custom WDA versions via `WDA_VERSION` env var
- Download retries 3 times with exponential backoff
- Build timeout: 5 minutes (configurable in build-wda.ts)
