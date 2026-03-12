import { join } from 'node:path'

const __dirname = import.meta.dirname!
const serverDir = join(__dirname, '..', '..')

/** Resolve the go-ios `ios` binary from apps/server/bin/. */
async function resolveIosBinary(): Promise<string> {
  const binName = process.platform === 'win32' ? 'ios.exe' : 'ios'
  const binPath = join(serverDir, 'bin', binName)

  if (await Bun.file(binPath).exists()) return binPath

  // Fallback: assume it's on PATH
  return binName
}

let iosBinaryPath: string | undefined

/** Get the path to the go-ios `ios` binary. */
export async function getIosBinary(): Promise<string> {
  if (!iosBinaryPath) {
    iosBinaryPath = await resolveIosBinary()
  }
  return iosBinaryPath
}

// ── Tunnel Manager ──────────────────────────────────────────────────────

// go-ios internal agent ports to probe. The agent port is auto-selected
// and may differ from --tunnel-info-port.
const AGENT_PORTS = [60105, 28100, 49151]

export interface TunnelInfo {
  address: string
  rsdPort: number
  udid: string
  agentPort: number
}

/**
 * Query a go-ios tunnel agent for device tunnel info.
 */
async function queryAgent(
  port: number
): Promise<Omit<TunnelInfo, 'agentPort'> | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/tunnels`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (!res.ok) return null

    const data: unknown = await res.json()
    if (!Array.isArray(data)) return null

    for (const d of data) {
      if (d.address && d.rsdPort && d.rsdPort > 0) {
        return { address: d.address, rsdPort: d.rsdPort, udid: d.udid }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Scan known ports for a running go-ios tunnel agent with a device. */
async function findAgent(): Promise<TunnelInfo | null> {
  for (const port of AGENT_PORTS) {
    const info = await queryAgent(port)
    if (info) return { ...info, agentPort: port }
  }
  return null
}

// ── DDI (Developer Disk Image) Manager ───────────────────────────────

let ddiMounted = false

/**
 * Ensure the Developer Disk Image is mounted on the device.
 * Required on iOS 17+ to expose testmanagerd and other developer services.
 */
export async function ensureDdiMounted(): Promise<void> {
  if (ddiMounted) return

  const ios = await getIosBinary()
  const ddiDir = join(serverDir, 'bin', 'ddi')

  // Check if DDI is already mounted
  try {
    const result = Bun.spawnSync([ios, 'image', 'list'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const out = result.stdout.toString()
    if (!out.includes('"none"')) {
      console.log('[go-ios] DDI already mounted')
      ddiMounted = true
      return
    }
  } catch {
    // image list failed, try mounting anyway
  }

  if (!(await Bun.file(join(ddiDir, 'BuildManifest.plist')).exists())) {
    console.warn(
      '[go-ios] DDI not found at ' +
        ddiDir +
        '. Run `bun scripts/install-go-ios.ts` to download it.'
    )
    return
  }

  console.log('[go-ios] Mounting Developer Disk Image...')
  try {
    const result = Bun.spawnSync([ios, 'image', 'mount', `--path=${ddiDir}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (!result.success) {
      throw new Error(result.stderr.toString())
    }
    console.log('[go-ios] DDI mounted successfully')
    ddiMounted = true
  } catch (e) {
    console.warn(
      `[go-ios] DDI mount failed: ${e instanceof Error ? e.message : e}. ` +
        'testmanagerd may not be available.'
    )
  }
}

/**
 * Spawn the go-ios tunnel with elevation and poll until a device tunnel
 * appears. Used by `ensureTunnel` for all platforms.
 */
async function elevateAndPoll(ios: string): Promise<TunnelInfo> {
  const plat = process.platform

  // Already root — spawn directly
  if (process.getuid?.() === 0) {
    console.log('[go-ios] Already root, starting tunnel directly...')
    const proc = Bun.spawn([ios, 'tunnel', 'start'], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    })
    proc.unref()
  } else if (plat === 'win32') {
    console.log('[go-ios] Starting tunnel with UAC elevation (userspace)...')
    // Use userspace tunnel — avoids WinTUN driver dependency and works
    // without a kernel TUN interface.  Still needs elevation for the
    // underlying device pairing / RemoteXPC handshake.
    const escapedPath = ios.replace(/'/g, "''")
    Bun.spawnSync(
      [
        'powershell',
        '-Command',
        `Start-Process -FilePath '${escapedPath}' ` +
          `-ArgumentList 'tunnel','start','--userspace' ` +
          `-WindowStyle Hidden -Verb RunAs`,
      ],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }
    )
  } else if (plat === 'darwin') {
    console.log('[go-ios] Starting tunnel with admin privileges (macOS)...')
    const escapedPath = ios.replace(/'/g, "'\\''")
    // Spawn osascript as a detached process. It shows the system password
    // dialog, then runs the tunnel as root in the foreground. The tunnel
    // stays alive because osascript keeps running. Node doesn't wait.
    const proc = Bun.spawn(
      [
        'osascript',
        '-e',
        `do shell script "\\"${escapedPath}\\" tunnel start" with administrator privileges`,
      ],
      { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' }
    )
    proc.unref()
  } else if (Bun.env.DISPLAY || Bun.env.WAYLAND_DISPLAY) {
    console.log('[go-ios] Starting tunnel with pkexec elevation (Linux)...')
    Bun.spawnSync(
      ['pkexec', 'sh', '-c', `"${ios}" tunnel start >/dev/null 2>&1 &`],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }
    )
  } else {
    throw new Error(
      'No go-ios tunnel agent detected. On iOS 17+, a tunnel is required.\n' +
        'Start one in a terminal with root privileges:\n\n' +
        `  sudo "${ios}" tunnel start\n\n` +
        'The tunnel must remain running while the server is active.'
    )
  }

  // Poll until a device tunnel is fully established
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const info = await findAgent()
    if (info) {
      console.log(
        `[go-ios] Tunnel ready on agent port ${info.agentPort}: ` +
          `${info.address}:${info.rsdPort} (${info.udid})`
      )
      return info
    }
    await Bun.sleep(1_000)
  }

  throw new Error(
    'go-ios tunnel was started but no device tunnel appeared within 30s. ' +
      'Check for errors in the elevated process.'
  )
}

/**
 * Ensure a go-ios tunnel is running for iOS 17+ devices.
 * Automatically elevates privileges on all platforms:
 * - Windows: UAC dialog via PowerShell
 * - macOS: system password dialog via osascript
 * - Linux (desktop): PolicyKit dialog via pkexec
 * - Already root: spawns directly
 */
export async function ensureTunnel(): Promise<TunnelInfo> {
  // Already running?
  const existing = await findAgent()
  if (existing) {
    console.log(
      `[go-ios] Tunnel ready on agent port ${existing.agentPort}: ` +
        `${existing.address}:${existing.rsdPort} (${existing.udid})`
    )
    return existing
  }

  return elevateAndPoll(await getIosBinary())
}
