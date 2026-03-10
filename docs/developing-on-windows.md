# Developing on Windows

Tachibana supports cross-platform iOS device interaction, including Windows. Since Xcode is macOS-only, the WDA (WebDriverAgent) IPA cannot be built on Windows — you'll need to obtain a pre-built IPA from a macOS machine and configure it manually.

## Prerequisites

- **iTunes or Apple Mobile Device Support** — required for USB communication with iOS devices (provides `usbmuxd`). Install [iTunes from the Microsoft Store](https://apps.microsoft.com/detail/9PB2MZ1ZMB1S) or from [apple.com](https://www.apple.com/itunes/).
- **Bun** — install from [bun.sh](https://bun.sh)
- **Rust toolchain** — install from [rustup.rs](https://rustup.rs) (target: `x86_64-pc-windows-msvc` or `aarch64-pc-windows-msvc`)
- **Visual Studio Build Tools** — required for compiling native Rust code (C/C++ workload)

## Setup

### 1. Clone and install dependencies

```powershell
git clone <repo-url> tachibana
cd tachibana
bun install
```

The `postinstall` step for `@tbana/ios-wda` will automatically skip the WDA IPA build on Windows and print a notice.

### 2. Obtain a pre-built WDA IPA

The WDA IPA must be built on a macOS machine. You have two options:

**Option A: Build on a macOS machine and copy**

On a Mac with Xcode installed:

```bash
cd tachibana
bun install  # This builds packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa
```

Copy the file `packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa` to your Windows machine.

**Option B: Use a CI-built artifact**

If your CI pipeline builds the IPA, download it from the pipeline artifacts.

### 3. Configure the IPA path

Set the `WDA_IPA_PATH` environment variable to point to your pre-built IPA:

**PowerShell (current session):**

```powershell
$env:WDA_IPA_PATH = "C:\path\to\WebDriverAgentRunner.ipa"
```

**System-wide (persistent):**

```powershell
[System.Environment]::SetEnvironmentVariable("WDA_IPA_PATH", "C:\path\to\WebDriverAgentRunner.ipa", "User")
```

Alternatively, place the IPA at `packages/ios-wda/ipa-build/WebDriverAgentRunner.ipa` in the project tree — the resolver checks this path as a fallback during development.

### 4. Run the server

```powershell
bun run --filter @tbana/server dev
```

## How it works on Windows

On macOS, Tachibana uses `xcodebuild test-without-building` to launch WDA on the device. On Windows (and Linux), it uses a **native Rust XCTest implementation** via the `idevice` crate, which:

- Connects to the device over USB via `usbmuxd` (provided by iTunes/Apple Mobile Device Support)
- Creates a CoreDevice tunnel for iOS 17+ without requiring `sudo` or a privileged daemon
- Speaks the testmanagerd DTX protocol directly to launch and manage XCTest sessions
- Handles both iOS 17+ (CoreDeviceTunnel) and older iOS (lockdown) paths

This means no Xcode, no `pymobiledevice3`, and no `sudo` tunnel is needed.

## Troubleshooting

### "WebDriverAgent IPA not found"

You haven't configured `WDA_IPA_PATH` or placed the IPA in the expected location. See step 3 above.

### Device not detected

Ensure iTunes (or Apple Mobile Device Support) is installed and the device is trusted. Check that the device appears in iTunes. The `usbmuxd` service must be running — it starts automatically with iTunes.

### Native build fails

Ensure you have:

- Rust toolchain installed (`rustup show` to verify)
- Visual Studio Build Tools with the "Desktop development with C++" workload
- The correct target: `rustup target add x86_64-pc-windows-msvc`

You can skip the native build temporarily with `SKIP_NAPI_BUILD=1 bun install` and use a pre-built `.node` binary if available.

### XCTest session fails to start

- Make sure the WDA IPA version is compatible with the iOS version on your device
- For iOS 17+, ensure the device has Developer Mode enabled (Settings > Privacy & Security > Developer Mode)
- Try uninstalling the "WebDriverAgent" app from the device and letting Tachibana reinstall it fresh
