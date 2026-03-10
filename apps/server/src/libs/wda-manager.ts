import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, platform } from 'node:os'
import {
  tunnel,
  xctest,
  wdaClient,
  ipa,
  generateBundleId,
} from '@tbana/ios-connect'
import { resolveWdaIpa } from '@tbana/ios-wda'
import { getSession } from './session.ts'
import { getConfig, setConfig } from './config.ts'

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
  xcodebuildProc?: ChildProcess
  xctestSessionId?: number
  waiters: Array<(entry: WdaEntry) => void>
}

/** Generate an xctestrun v2 plist for running pre-installed WDA via xcodebuild. */
function generateXctestrunPlist(
  bundleId: string,
  httpPort: number,
  mjpegPort: number
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>__xctestrun_metadata__</key>
    <dict>
        <key>FormatVersion</key>
        <integer>2</integer>
    </dict>
    <key>TestConfigurations</key>
    <array>
        <dict>
            <key>Name</key>
            <string>Default</string>
            <key>TestTargets</key>
            <array>
                <dict>
                    <key>BlueprintName</key>
                    <string>WebDriverAgentRunner</string>
                    <key>UseDestinationArtifacts</key>
                    <true/>
                    <key>TestBundleDestinationRelativePath</key>
                    <string>PlugIns/WebDriverAgentRunner.xctest</string>
                    <key>TestHostBundleIdentifier</key>
                    <string>${bundleId}</string>
                    <key>UITargetAppBundleIdentifier</key>
                    <string>${bundleId}</string>
                    <key>IsUITestBundle</key>
                    <true/>
                    <key>EnvironmentVariables</key>
                    <dict>
                        <key>USE_PORT</key>
                        <string>${httpPort}</string>
                        <key>MJPEG_SERVER_PORT</key>
                        <string>${mjpegPort}</string>
                    </dict>
                </dict>
            </array>
        </dict>
    </array>
</dict>
</plist>`
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

      // 2. Launch via xcodebuild + tunnel + health check
      const result = await this.launchAndCheck(udid, appInfo, entry, log)

      if (!result.healthy) {
        entry.xcodebuildProc?.kill()
        entry.xcodebuildProc = undefined
        if (entry.xctestSessionId !== undefined) {
          await xctest.stopXCUITest(entry.xctestSessionId)
          entry.xctestSessionId = undefined
        }
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
      if (entry.xcodebuildProc) {
        entry.xcodebuildProc.kill()
        entry.xcodebuildProc = undefined
      }
      if (entry.xctestSessionId !== undefined) {
        await xctest.stopXCUITest(entry.xctestSessionId)
        entry.xctestSessionId = undefined
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

  /** Launch WDA, set up tunnels, and poll health.
   *  macOS: uses xcodebuild test-without-building (proven, handles testmanagerd internally)
   *  Non-macOS: uses native Rust xctest via idevice CDTunnel (no sudo, cross-platform) */
  private async launchAndCheck(
    udid: string,
    appInfo: WdaAppInfo,
    entry: WdaEntry,
    log: (msg: string) => void
  ) {
    const { bundleId } = appInfo

    if (platform() === 'darwin') {
      await this.launchViaXcodebuild(udid, bundleId, entry, log)
    } else {
      await this.launchViaNativeXCTest(udid, bundleId, entry, log)
    }

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
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }

    return { mainPort, mjpegPort, wdaSession, healthy: false as const }
  }

  /** macOS path: launch WDA via xcodebuild test-without-building. */
  private async launchViaXcodebuild(
    udid: string,
    bundleId: string,
    entry: WdaEntry,
    log: (msg: string) => void
  ) {
    log('Launching WDA via xcodebuild...')
    const xctestrunPath = join(tmpdir(), `wda-${udid.slice(-8)}.xctestrun`)
    await writeFile(
      xctestrunPath,
      generateXctestrunPlist(bundleId, WDA_HTTP_PORT, WDA_MJPEG_PORT)
    )

    const proc = spawn(
      'xcodebuild',
      [
        'test-without-building',
        '-xctestrun',
        xctestrunPath,
        '-destination',
        `platform=iOS,id=${udid}`,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    entry.xcodebuildProc = proc

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('xcodebuild: WDA did not start within 90s'))
      }, 90_000)

      let output = ''
      const onData = (data: Buffer) => {
        const chunk = data.toString()
        output += chunk
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim()
          if (
            trimmed &&
            (trimmed.includes('ServerURLHere') ||
              trimmed.includes('Test Suite') ||
              trimmed.includes('Test Case') ||
              trimmed.includes('error:'))
          ) {
            log(`xcodebuild: ${trimmed}`)
          }
        }
        if (output.includes('ServerURLHere')) {
          clearTimeout(timeout)
          resolve()
        }
      }

      proc.stderr?.on('data', onData)
      proc.stdout?.on('data', onData)

      proc.on('error', err => {
        clearTimeout(timeout)
        reject(err)
      })

      proc.on('exit', code => {
        clearTimeout(timeout)
        if (!output.includes('ServerURLHere')) {
          reject(
            new Error(`xcodebuild exited with code ${code} before WDA started`)
          )
        }
      })
    })
    log('WDA HTTP server started')
  }

  /** Non-macOS path: launch WDA via native Rust xctest (idevice CDTunnel). */
  private async launchViaNativeXCTest(
    udid: string,
    bundleId: string,
    entry: WdaEntry,
    log: (msg: string) => void
  ) {
    log('Launching WDA via native XCTest (cross-platform)...')

    const result = await xctest.startXCUITest(udid, bundleId, bundleId, {
      USE_PORT: String(WDA_HTTP_PORT),
      MJPEG_SERVER_PORT: String(WDA_MJPEG_PORT),
    })

    if (!result.success) {
      throw new Error(`Native XCTest launch failed: ${result.error.message}`)
    }

    entry.xctestSessionId = result.data.sessionId
    log(`Native XCTest session started (id: ${result.data.sessionId})`)
  }

  /**
   * Find WDA on device — returns bundle ID and app path.
   * Uses pymobiledevice3 app listing via lockdown (no developer tunnel needed).
   */
  private async findWdaAppInfo(
    udid: string,
    log: (msg: string) => void
  ): Promise<WdaAppInfo | null> {
    try {
      return new Promise(resolve => {
        execFile(
          'pymobiledevice3',
          ['apps', 'list', '--udid', udid],
          { timeout: 15_000, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout) => {
            if (error) {
              log(`Error listing apps: ${error.message}`)
              resolve(null)
              return
            }
            try {
              const apps = JSON.parse(stdout) as Record<
                string,
                Record<string, unknown>
              >
              for (const [bid, info] of Object.entries(apps)) {
                if (info.CFBundleExecutable === 'WebDriverAgentRunner-Runner') {
                  log(`Found WDA on device: ${bid}`)
                  resolve({ bundleId: bid })
                  return
                }
              }
            } catch (e) {
              log(`Error parsing app list: ${e}`)
            }
            resolve(null)
          }
        )
      })
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
    const { path: ipaPath } = resolveWdaIpa()
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
    if (entry.xcodebuildProc) {
      entry.xcodebuildProc.kill()
      entry.xcodebuildProc = undefined
    }
    if (entry.xctestSessionId !== undefined) {
      await xctest.stopXCUITest(entry.xctestSessionId)
      entry.xctestSessionId = undefined
    }
    if (entry.mainPort !== undefined) await tunnel.stopTunnel(entry.mainPort)
    if (entry.mjpegPort !== undefined) await tunnel.stopTunnel(entry.mjpegPort)

    this.entries.delete(udid)
  }
}

export const wdaManager = new WdaManager()
