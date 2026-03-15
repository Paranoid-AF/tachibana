import { join } from 'node:path'
import { serverDir } from './runtime.ts'

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
 * Query a go-ios tunnel agent for all device tunnel entries.
 */
async function queryAgentAll(
  port: number
): Promise<Omit<TunnelInfo, 'agentPort'>[]> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/tunnels`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (!res.ok) return []

    const data: unknown = await res.json()
    if (!Array.isArray(data)) return []

    const results: Omit<TunnelInfo, 'agentPort'>[] = []
    for (const d of data) {
      if (d.address && d.rsdPort && d.rsdPort > 0) {
        results.push({ address: d.address, rsdPort: d.rsdPort, udid: d.udid })
      }
    }
    return results
  } catch {
    return []
  }
}

/** Scan known ports for a running go-ios tunnel agent. Returns the first agent with at least one device. */
async function findAgent(): Promise<TunnelInfo | null> {
  for (const port of AGENT_PORTS) {
    const infos = await queryAgentAll(port)
    if (infos.length > 0) return { ...infos[0], agentPort: port }
  }
  return null
}

/** Query all known agent ports and return all tunnel entries. */
export async function queryAllTunnels(): Promise<TunnelInfo[]> {
  for (const port of AGENT_PORTS) {
    const infos = await queryAgentAll(port)
    if (infos.length > 0) {
      return infos.map(info => ({ ...info, agentPort: port }))
    }
  }
  return []
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
 * Spawn the go-ios tunnel process (server must already be elevated)
 * and poll until the agent HTTP endpoint responds.
 */
async function spawnTunnelAndPoll(ios: string): Promise<TunnelInfo> {
  console.log('[go-ios] Starting tunnel process (server is elevated)...')

  const args = [ios, 'tunnel', 'start']
  if (process.platform === 'win32') args.push('--userspace')

  const proc = Bun.spawn(args, {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })
  proc.unref()

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
 * The server process must already be elevated (via ensureElevated).
 * Spawns the tunnel process directly since we inherit root privileges.
 */
let tunnelInFlight: Promise<TunnelInfo> | null = null

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

  // Coalesce concurrent spawn attempts
  if (tunnelInFlight) return tunnelInFlight

  tunnelInFlight = spawnTunnelAndPoll(await getIosBinary())
  try {
    return await tunnelInFlight
  } finally {
    tunnelInFlight = null
  }
}
