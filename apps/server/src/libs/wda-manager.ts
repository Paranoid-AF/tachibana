import { unlink } from 'node:fs/promises'
import { tunnel, wdaClient, ipa, generateBundleId } from '@tbana/ios-connect'
import { resolveWdaIpa } from '@tbana/ios-wda'
import { getSession } from './session.ts'
import { readPersistedConfig, setConfig } from './config.ts'

async function getOrCreateWdaBundleId(): Promise<string> {
  const persisted = await readPersistedConfig()
  if (persisted.wda?.bundleId) return persisted.wda.bundleId

  const bundleId = generateBundleId()
  await setConfig({ wda: { bundleId } })
  return bundleId
}

const { WdaClient, WdaSession } = wdaClient

type WdaState = 'idle' | 'preparing' | 'ready' | 'error'

interface WdaEntry {
  state: WdaState
  error?: string
  mainPort?: number
  mjpegPort?: number
  wdaSession?: InstanceType<typeof WdaSession>
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
    if (entry.state === 'error') return Promise.reject(new Error(entry.error ?? 'WDA error'))

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
    let mainPort: number | undefined
    let mjpegPort: number | undefined

    try {
      const session = await getSession()

      const teams = await session.listTeams()
      if (teams.length === 0) throw new Error('No Apple Developer teams found')
      const teamId = teams[0].teamId

      const { path: ipaPath } = resolveWdaIpa()
      const bundleId = await getOrCreateWdaBundleId()
      const patchedIpaPath = await ipa.rewriteIpaBundleId(ipaPath, bundleId)
      try {
        await session.installApp(patchedIpaPath, udid, teamId)
      } finally {
        await unlink(patchedIpaPath).catch(() => {})
      }

      const mainResult = await tunnel.startTunnel(udid, 8100)
      if (!mainResult.success) throw new Error(mainResult.error.message)
      mainPort = mainResult.data.localPort

      const mjpegResult = await tunnel.startTunnel(udid, 9100)
      if (!mjpegResult.success) throw new Error(mjpegResult.error.message)
      mjpegPort = mjpegResult.data.localPort

      entry.mainPort = mainPort
      entry.mjpegPort = mjpegPort

      const client = new WdaClient(`http://localhost:${mainPort}`)
      const wdaSession = new WdaSession(client)

      const POLL_INTERVAL_MS = 2_000
      const MAX_WAIT_MS = 60_000
      const deadline = Date.now() + MAX_WAIT_MS

      while (Date.now() < deadline) {
        if (await wdaSession.isHealthy()) break
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      }

      if (!(await wdaSession.isHealthy())) {
        throw new Error('WDA did not become healthy in time')
      }

      await wdaSession.ensureSession()

      entry.wdaSession = wdaSession
      entry.state = 'ready'
      this.flush(entry)
    } catch (err) {
      if (mainPort !== undefined) await tunnel.stopTunnel(mainPort)
      if (mjpegPort !== undefined) await tunnel.stopTunnel(mjpegPort)
      entry.mainPort = undefined
      entry.mjpegPort = undefined
      entry.state = 'error'
      entry.error = err instanceof Error ? err.message : String(err)
      this.flush(entry)
    }
  }

  async stop(udid: string): Promise<void> {
    const entry = this.entries.get(udid)
    if (!entry) return

    if (entry.wdaSession) await entry.wdaSession.destroy().catch(() => {})
    if (entry.mainPort !== undefined) await tunnel.stopTunnel(entry.mainPort)
    if (entry.mjpegPort !== undefined) await tunnel.stopTunnel(entry.mjpegPort)

    this.entries.delete(udid)
  }
}

export const wdaManager = new WdaManager()
