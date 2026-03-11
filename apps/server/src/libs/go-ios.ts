import { execSync } from 'node:child_process'
import { platform } from 'node:os'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverDir = join(__dirname, '..', '..')

/** Resolve the go-ios `ios` binary from apps/server/bin/. */
function resolveIosBinary(): string {
  const binName = platform() === 'win32' ? 'ios.exe' : 'ios'
  const binPath = join(serverDir, 'bin', binName)

  if (existsSync(binPath)) return binPath

  // Fallback: assume it's on PATH
  return binName
}

let iosBinaryPath: string | undefined

/** Get the path to the go-ios `ios` binary. */
export function getIosBinary(): string {
  if (!iosBinaryPath) {
    iosBinaryPath = resolveIosBinary()
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
async function queryAgent(port: number): Promise<Omit<TunnelInfo, 'agentPort'> | null> {
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
export function ensureDdiMounted(): void {
  if (ddiMounted) return

  const ios = getIosBinary()
  const ddiDir = join(serverDir, 'bin', 'ddi')

  // Check if DDI is already mounted
  try {
    const out = execSync(`"${ios}" image list`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (!out.includes('"none"')) {
      console.log('[go-ios] DDI already mounted')
      ddiMounted = true
      return
    }
  } catch {
    // image list failed, try mounting anyway
  }

  if (!existsSync(join(ddiDir, 'BuildManifest.plist'))) {
    console.warn(
      '[go-ios] DDI not found at ' +
        ddiDir +
        '. Run `bun scripts/install-go-ios.ts` to download it.'
    )
    return
  }

  console.log('[go-ios] Mounting Developer Disk Image...')
  try {
    execSync(`"${ios}" image mount --path="${ddiDir}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
 * Ensure a go-ios tunnel is running for iOS 17+ devices.
 * On Windows, starts an elevated process (UAC prompt) automatically.
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

  const ios = getIosBinary()

  if (platform() === 'win32') {
    console.log('[go-ios] Starting tunnel with UAC elevation (userspace)...')

    // Use userspace tunnel — avoids WinTUN driver dependency and works
    // without a kernel TUN interface.  Still needs elevation for the
    // underlying device pairing / RemoteXPC handshake.
    const escapedPath = ios.replace(/'/g, "''")
    execSync(
      `powershell -Command "Start-Process -FilePath '${escapedPath}' ` +
        `-ArgumentList 'tunnel','start','--userspace' ` +
        `-Verb RunAs"`,
      { stdio: 'ignore' }
    )

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
      await new Promise(r => setTimeout(r, 1_000))
    }

    throw new Error(
      'go-ios tunnel was started but no device tunnel appeared within 30s. ' +
        'Check the elevated console window for errors (e.g. missing wintun.dll).'
    )
  }

  // Non-Windows: needs sudo, user must start manually
  throw new Error(
    'No go-ios tunnel agent detected. On iOS 17+, a tunnel is required.\n' +
      'Start one in a terminal with root privileges:\n\n' +
      `  sudo "${ios}" tunnel start\n\n` +
      'The tunnel must remain running while the server is active.'
  )
}

