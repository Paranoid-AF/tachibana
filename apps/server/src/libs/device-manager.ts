import { device } from '@tbana/ios-connect'
import type { ConnectedDevice } from '@tbana/ios-connect'

import { getSession } from './session.ts'
import { withSessionRetry } from './session-guard.ts'
import { wdaManager } from './wda-manager.ts'
import { ensureTunnel } from './go-ios.ts'

const POLL_INTERVAL_MS = 5_000

type WdaState = 'idle' | 'preparing' | 'ready' | 'error'

export interface DeviceEntry {
  udid: string
  connected: boolean
  linked: boolean
  tunnelReady: boolean
  wdaState: WdaState
  wdaError?: string
  mainPort?: number
  mjpegPort?: number
}

class DeviceManager {
  private devices = new Map<string, DeviceEntry>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private running = false
  /** Cache: UDIDs we've confirmed as linked (paired + registered). */
  private linkedCache = new Set<string>()

  start(): void {
    if (this.running) return
    this.running = true
    console.log('[DeviceManager] Starting watchdog')
    // Run an initial scan immediately, then poll
    this.poll().catch(err =>
      console.error('[DeviceManager] Initial poll error:', err)
    )
    this.pollTimer = setInterval(() => {
      this.poll().catch(err =>
        console.error('[DeviceManager] Poll error:', err)
      )
    }, POLL_INTERVAL_MS)
    wdaManager.startKeepAwake()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    wdaManager.stopKeepAwake()
    console.log('[DeviceManager] Stopping — cleaning up all devices')
    const stopTasks = [...this.devices.keys()].map(udid =>
      this.cleanupDevice(udid)
    )
    await Promise.allSettled(stopTasks)
    this.devices.clear()
    this.linkedCache.clear()
  }

  getDevice(udid: string): DeviceEntry | undefined {
    return this.devices.get(udid)
  }

  getAllDevices(): DeviceEntry[] {
    return [...this.devices.values()]
  }

  async waitUntilReady(udid: string, timeoutMs = 90_000): Promise<number> {
    const entry = this.devices.get(udid)
    if (entry?.wdaState === 'ready' && entry.mjpegPort) {
      return entry.mjpegPort
    }
    if (entry?.wdaState === 'error') {
      throw new Error(entry.wdaError ?? 'WDA error')
    }

    // Delegate to wdaManager's waiter mechanism
    return wdaManager.waitUntilReady(udid, timeoutMs)
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const connectedResult = await device.listConnected()
    const connected: ConnectedDevice[] = connectedResult.success
      ? connectedResult.data
      : []

    const currentUdids = new Set(connected.map(d => d.udid))

    // Detect disconnected devices
    for (const [udid, entry] of this.devices) {
      if (!currentUdids.has(udid) && entry.connected) {
        console.log(`[DeviceManager] Device disconnected: ${udid.slice(-8)}`)
        await this.cleanupDevice(udid)
        this.devices.delete(udid)
      }
    }

    // Process connected devices
    for (const d of connected) {
      const existing = this.devices.get(d.udid)

      if (existing && existing.connected) {
        // Already tracked and connected — sync WDA state from wdaManager
        this.syncWdaState(d.udid, existing)
        continue
      }

      // New device or previously disconnected
      const linked = await this.checkLinked(d.udid)
      const entry: DeviceEntry = {
        udid: d.udid,
        connected: true,
        linked,
        tunnelReady: false,
        wdaState: 'idle',
      }
      this.devices.set(d.udid, entry)

      if (linked) {
        console.log(
          `[DeviceManager] Linked device detected: ${d.udid.slice(-8)} — starting setup`
        )
        this.setupDevice(d.udid, entry).catch(err =>
          console.error(
            `[DeviceManager] Setup failed for ${d.udid.slice(-8)}:`,
            err
          )
        )
      } else {
        console.log(
          `[DeviceManager] Unlinked device detected: ${d.udid.slice(-8)} — skipping`
        )
      }
    }
  }

  private async checkLinked(udid: string): Promise<boolean> {
    if (this.linkedCache.has(udid)) return true

    try {
      const session = await getSession()
      const [paired, sessionInfo] = await Promise.all([
        session.validatePairing(udid),
        session.getSessionInfo(),
      ])

      if (!paired || !sessionInfo.loggedIn) return false

      const registered = await withSessionRetry(s => s.listDevices())
      const isRegistered = registered.some(d => d.udid === udid)
      if (paired && isRegistered) {
        this.linkedCache.add(udid)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  private async setupDevice(
    udid: string,
    entry: DeviceEntry
  ): Promise<void> {
    try {
      // Ensure go-ios kernel tunnel is running
      await ensureTunnel()
      entry.tunnelReady = true

      // Start WDA preparation
      entry.wdaState = 'preparing'
      wdaManager.prepare(udid)

      // Wait for WDA to become ready and capture ports
      const mjpegPort = await wdaManager.waitUntilReady(udid)
      const wdaState = wdaManager.getState(udid)

      entry.wdaState = 'ready'
      entry.mjpegPort = mjpegPort
      // mainPort is tracked inside wdaManager; sync it
      this.syncWdaState(udid, entry)
      console.log(
        `[DeviceManager] Device ${udid.slice(-8)} is ready (MJPEG port: ${mjpegPort})`
      )
    } catch (err) {
      entry.wdaState = 'error'
      entry.wdaError = err instanceof Error ? err.message : String(err)
      console.error(
        `[DeviceManager] Device ${udid.slice(-8)} setup error: ${entry.wdaError}`
      )
    }
  }

  private syncWdaState(udid: string, entry: DeviceEntry): void {
    const wdaState = wdaManager.getState(udid)
    entry.wdaState = wdaState.state
    entry.wdaError = wdaState.error
    entry.mainPort = wdaState.mainPort
  }

  private async cleanupDevice(udid: string): Promise<void> {
    try {
      await wdaManager.stop(udid)
    } catch (err) {
      console.error(
        `[DeviceManager] Cleanup error for ${udid.slice(-8)}:`,
        err
      )
    }
  }
}

export const deviceManager = new DeviceManager()
