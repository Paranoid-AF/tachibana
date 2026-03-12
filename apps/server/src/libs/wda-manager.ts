import {
  tunnel,
  wdaClient,
  ipa,
  apps,
  generateBundleId,
} from '@tbana/ios-connect'
import { resolveWdaIpa } from '@tbana/ios-wda'
import { getSession } from './session.ts'
import { getConfig, setConfig } from './config.ts'
import { ensureTunnel, ensureDdiMounted, getIosBinary } from './go-ios.ts'

const { WdaClient, WdaSession } = wdaClient

const WDA_HTTP_PORT = 8100
const WDA_MJPEG_PORT = 9100

type WdaState = 'idle' | 'preparing' | 'ready' | 'error'

interface WdaAppInfo {
  bundleId: string
}

interface WdaEntry {
  state: WdaState
  error?: string
  mainPort?: number
  mjpegPort?: number
  wdaSession?: InstanceType<typeof WdaSession>
  goIosProc?: ReturnType<typeof Bun.spawn>
  waiters: Array<(entry: WdaEntry) => void>
}

class WdaManager {
  private entries = new Map<string, WdaEntry>()

  private getOrCreate(udid: string): WdaEntry {
    if (!this.entries.has(udid)) {
      this.entries.set(udid, { state: 'idle', waiters: [] })
    }
    return this.entries.get(udid)!
  }

  getState(udid: string): { state: WdaState; error?: string } {
    const entry = this.entries.get(udid)
    return { state: entry?.state ?? 'idle', error: entry?.error }
  }

  waitUntilReady(udid: string, timeoutMs = 90_000): Promise<number> {
    const entry = this.getOrCreate(udid)

    if (entry.state === 'ready') return Promise.resolve(entry.mjpegPort!)
    if (entry.state === 'error')
      return Promise.reject(new Error(entry.error ?? 'WDA error'))

    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = entry.waiters.indexOf(cb)
        if (idx !== -1) entry.waiters.splice(idx, 1)
        reject(new Error('Timed out waiting for WDA to start'))
      }, timeoutMs)

      const cb = (e: WdaEntry) => {
        clearTimeout(timer)
        if (e.state === 'ready') resolve(e.mjpegPort!)
        else reject(new Error(e.error ?? 'WDA failed to start'))
      }
      entry.waiters.push(cb)
    })
  }

  private flush(entry: WdaEntry) {
    const waiters = entry.waiters.splice(0)
    for (const cb of waiters) cb(entry)
  }

  prepare(udid: string): void {
    const entry = this.getOrCreate(udid)
    if (entry.state === 'preparing' || entry.state === 'ready') return
    entry.state = 'preparing'
    entry.error = undefined
    this._run(udid, entry).catch(() => {})
  }

  private async _run(udid: string, entry: WdaEntry): Promise<void> {
    const log = (msg: string) => console.log(`[WDA ${udid.slice(-8)}] ${msg}`)

    try {
      log('Starting WDA setup')

      // 1. Find WDA on device or sideload, then look up app info
      let appInfo = await this.findWdaAppInfo(udid, log)

      if (!appInfo) {
        log('WDA not found on device, installing...')
        await this.installWda(udid, log)
        // After install, look up the actual bundle ID & path on device
        appInfo = await this.findWdaAppInfo(udid, log)
        if (!appInfo)
          throw new Error('WDA was installed but could not be found on device')
      }

      log(`WDA bundle ID: ${appInfo.bundleId}`)

      // 2. Launch via go-ios + tunnel + health check
      const result = await this.launchAndCheck(udid, appInfo, entry, log)

      if (!result.healthy) {
        entry.goIosProc?.kill()
        entry.goIosProc = undefined
        await tunnel.stopTunnel(result.mainPort)
        await tunnel.stopTunnel(result.mjpegPort)
        throw new Error(
          'WDA launched but its HTTP server did not respond to health checks. ' +
            'This usually means the installed WDA has conflicting XCTest frameworks (iOS 17+). ' +
            'Please uninstall the "WebDriverAgent" app from your device and retry — ' +
            'a fresh copy with stripped frameworks will be installed automatically.'
        )
      }

      log('WDA is healthy, creating session...')
      await result.wdaSession.ensureSession()
      log('WDA session created, ready!')

      entry.mainPort = result.mainPort
      entry.mjpegPort = result.mjpegPort
      entry.wdaSession = result.wdaSession
      entry.state = 'ready'
      this.flush(entry)
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`)
      if (entry.goIosProc) {
        entry.goIosProc.kill()
        entry.goIosProc = undefined
      }
      if (entry.mainPort !== undefined) await tunnel.stopTunnel(entry.mainPort)
      if (entry.mjpegPort !== undefined)
        await tunnel.stopTunnel(entry.mjpegPort)
      entry.mainPort = undefined
      entry.mjpegPort = undefined
      entry.state = 'error'
      entry.error = err instanceof Error ? err.message : String(err)
      this.flush(entry)
    }
  }

  /** Launch WDA via go-ios `runwda` through tunnel, set up port tunnels, and poll health. */
  private async launchAndCheck(
    udid: string,
    appInfo: WdaAppInfo,
    entry: WdaEntry,
    log: (msg: string) => void
  ) {
    const { bundleId } = appInfo

    await this.launchViaGoIos(udid, bundleId, entry, log)

    // Tunnel device ports to localhost
    const mainResult = await tunnel.startTunnel(udid, WDA_HTTP_PORT)
    if (!mainResult.success) throw new Error(mainResult.error.message)
    const mainPort = mainResult.data.localPort
    log(`Main tunnel: device:${WDA_HTTP_PORT} → localhost:${mainPort}`)

    const mjpegResult = await tunnel.startTunnel(udid, WDA_MJPEG_PORT)
    if (!mjpegResult.success) throw new Error(mjpegResult.error.message)
    const mjpegPort = mjpegResult.data.localPort
    log(`MJPEG tunnel: device:${WDA_MJPEG_PORT} → localhost:${mjpegPort}`)

    // Health check — poll until WDA server responds via tunnel
    const client = new WdaClient(`http://localhost:${mainPort}`)
    const wdaSession = new WdaSession(client)

    const POLL_INTERVAL_MS = 2_000
    const MAX_WAIT_MS = 30_000
    const deadline = Date.now() + MAX_WAIT_MS
    let attempt = 0

    log('Polling WDA health...')
    while (Date.now() < deadline) {
      attempt++
      const healthy = await wdaSession.isHealthy()
      log(`Health check #${attempt}: ${healthy ? 'healthy' : 'not ready'}`)
      if (healthy)
        return { mainPort, mjpegPort, wdaSession, healthy: true as const }
      await Bun.sleep(POLL_INTERVAL_MS)
    }

    return { mainPort, mjpegPort, wdaSession, healthy: false as const }
  }

  /** Launch WDA via go-ios `runwda` command.
   *  Requires a go-ios kernel TUN tunnel (iOS 17+). */
  private async launchViaGoIos(
    udid: string,
    bundleId: string,
    entry: WdaEntry,
    log: (msg: string) => void
  ) {
    // Ensure DDI is mounted (required for testmanagerd on iOS 17+)
    await ensureDdiMounted()

    // Ensure tunnel is running (required for runwda)
    await ensureTunnel()
    log('go-ios tunnel ready')

    const ios = await getIosBinary()
    log('Launching WDA via go-ios runwda...')

    const proc = Bun.spawn(
      [
        ios,
        'runwda',
        `--bundleid=${bundleId}`,
        `--testrunnerbundleid=${bundleId}`,
        '--xctestconfig=WebDriverAgentRunner.xctest',
        `--env=USE_PORT=${WDA_HTTP_PORT}`,
        `--env=MJPEG_SERVER_PORT=${WDA_MJPEG_PORT}`,
        `--udid=${udid}`,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      }
    )
    entry.goIosProc = proc

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Process is still running — assume WDA is starting up.
        // Health check polling will verify it later.
        resolve()
      }, 10_000)

      let output = ''
      let settled = false

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fn()
      }

      // Read stdout
      const readStream = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            output += chunk
            for (const line of chunk.split('\n')) {
              const trimmed = line.trim()
              if (trimmed) log(`runwda: ${trimmed}`)
            }
            // go-ios prints "ServerURLHere" when WDA HTTP server is ready
            if (output.includes('ServerURLHere')) {
              settle(() => resolve())
            }
          }
        } catch {
          // stream closed
        }
      }

      readStream(proc.stdout)
      readStream(proc.stderr)

      // Handle process exit
      proc.exited.then(code => {
        if (!output.includes('ServerURLHere')) {
          settle(() =>
            reject(
              new Error(
                `go-ios runwda exited with code ${code} before WDA started`
              )
            )
          )
        }
      })
    })
    log('WDA launched via go-ios')
  }

  /**
   * Find WDA on device — returns bundle ID.
   * Uses native installation_proxy via lockdown (no external binaries needed).
   */
  private async findWdaAppInfo(
    udid: string,
    log: (msg: string) => void
  ): Promise<WdaAppInfo | null> {
    try {
      const result = await apps.listInstalledApps(udid, 'User')
      if (!result.success) {
        log(`Error listing apps: ${result.error.message}`)
        return null
      }
      for (const app of result.data) {
        if (app.bundleExecutable === 'WebDriverAgentRunner-Runner') {
          log(`Found WDA on device: ${app.bundleId}`)
          return { bundleId: app.bundleId }
        }
      }
      return null
    } catch (e) {
      log(`Failed to check for WDA: ${e}`)
      return null
    }
  }

  /** Sideload WDA IPA onto the device. Returns the installed bundle ID. */
  private async installWda(
    udid: string,
    log: (msg: string) => void
  ): Promise<string> {
    const session = await getSession()
    const teams = await session.listTeams()
    if (teams.length === 0) throw new Error('No Apple Developer teams found')
    const teamId = teams[0].teamId
    log(`Using team ${teamId}`)

    // Resolve WDA IPA
    const { path: ipaPath } = await resolveWdaIpa()
    log(`WDA IPA: ${ipaPath}`)

    // Reuse stored bundle ID from config to avoid burning free-tier bundle ID slots
    const config = await getConfig()
    let baseBundleId = config.wda.bundleId
    if (!baseBundleId) {
      baseBundleId = generateBundleId()
      await setConfig({ wda: { bundleId: baseBundleId } })
      log(`Generated new bundle ID: ${baseBundleId}`)
    } else {
      log(`Reusing stored bundle ID: ${baseBundleId}`)
    }

    // Rewrite bundle ID (also strips XCTest frameworks for iOS 17+ compat)
    const rewrittenPath = await ipa.rewriteIpaBundleId(ipaPath, baseBundleId)

    // Sign and install
    await session.installApp(rewrittenPath, udid, teamId)
    log('WDA installed successfully')

    return baseBundleId
  }

  async stop(udid: string): Promise<void> {
    const entry = this.entries.get(udid)
    if (!entry) return

    if (entry.wdaSession) await entry.wdaSession.destroy().catch(() => {})
    if (entry.goIosProc) {
      entry.goIosProc.kill()
      entry.goIosProc = undefined
    }
    if (entry.mainPort !== undefined) await tunnel.stopTunnel(entry.mainPort)
    if (entry.mjpegPort !== undefined) await tunnel.stopTunnel(entry.mjpegPort)

    this.entries.delete(udid)
  }
}

export const wdaManager = new WdaManager()
