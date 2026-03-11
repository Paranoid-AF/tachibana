# Running on Windows

## Prerequisites

- **Node.js** v22+ (via [fnm](https://github.com/Schniz/fnm) or nvm-windows)
- **Bun** (for build/dev tooling)
- **iTunes** or **Apple Devices** app (installs Apple Mobile Device USB drivers)
- **Rust toolchain** (for building the native addon)
- **Apple Developer account** (free tier works)

## iOS 17+ Tunnel Setup

iOS 17 and later require a **Remote Pairing tunnel** for developer services like XCTest.
The tunnel uses a TUN network device, which needs:

1. **wintun.dll** — a lightweight TUN driver for Windows
2. **Administrator privileges** — to create the TUN interface
3. **go-ios** — handles the tunnel protocol

### Automatic Setup

The install script downloads both `ios.exe` and `wintun.dll`:

```bash
node apps/server/scripts/install-go-ios.ts
```

This places both files in `apps/server/bin/`.

### Manual Setup

If the automatic download fails:

1. Download `wintun.dll` from [wintun.net](https://www.wintun.net/)
2. Extract the **amd64** version from `wintun/bin/amd64/wintun.dll`
3. Place it in `apps/server/bin/` next to `ios.exe`

### Starting the Tunnel

The tunnel must be started **manually in an Administrator terminal** before running the server:

```powershell
# In an elevated (Run as Administrator) terminal:
.\apps\server\bin\ios.exe tunnel start
```

Keep this terminal open — the tunnel must remain running while the server is active.
The server will detect the running tunnel automatically.

If you see `Error creating TUN device: Error loading wintun.dll`, ensure `wintun.dll`
is in the same directory as `ios.exe`.

## Running the Server

```bash
# In a normal (non-admin) terminal:
bun run dev --filter=@tbana/server
```

The server will:
1. Detect connected iOS devices via USB
2. Check for a running go-ios tunnel (iOS 17+)
3. Sideload and launch WebDriverAgent
4. Provide device streaming at `http://localhost:5173`

## Troubleshooting

### "Unable to Verify App" on iPhone

After sideloading WDA, the developer certificate must be trusted:

1. On your iPhone, go to **Settings > General > VPN & Device Management**
2. Tap the developer certificate
3. Tap **Trust** (requires internet connection)

### "No go-ios tunnel agent detected"

The server could not find a running tunnel. Make sure:
- `ios.exe tunnel start` is running in an admin terminal
- `wintun.dll` is next to `ios.exe`
- The device is connected via USB and paired

### Tunnel keeps retrying with "Error loading wintun.dll"

The `wintun.dll` file is missing or in the wrong directory.
It must be in the same folder as `ios.exe` (`apps/server/bin/`).

### Connection aborted during XCTest

If you see `wsasend: An established connection was aborted`, the userspace tunnel
may be unreliable. Use the kernel tunnel (default `ios.exe tunnel start` without
`--userspace`) with `wintun.dll` instead.
