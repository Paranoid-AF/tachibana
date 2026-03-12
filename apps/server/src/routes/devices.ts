import { Elysia, t } from 'elysia'

import { device, apps } from '@tbana/ios-connect'
import type { ConnectedDevice, Device } from '@tbana/ios-connect'

import { getSession } from '../libs/session.ts'
import { withSessionRetry } from '../libs/session-guard.ts'
import {
  getDeviceMeta,
  saveDeviceMeta,
  getDevicePrefs,
  setDevicePrefs,
} from '../libs/device-store.ts'
import { getConfig } from '../libs/config.ts'
import { wdaManager } from '../libs/wda-manager.ts'
import { deviceManager } from '../libs/device-manager.ts'

export interface MergedDeviceInfo extends Omit<
  Partial<ConnectedDevice> & Device,
  'status'
> {
  paired: boolean
  connected: boolean
  registered: boolean
}

export interface DeviceListResponseItem extends Omit<
  MergedDeviceInfo,
  'paired' | 'registered'
> {
  linked: boolean
}

// Well-known Apple system apps visible on the home screen
const VISIBLE_SYSTEM_APPS = new Set([
  'com.apple.Preferences', // Settings
  'com.apple.mobilesafari', // Safari
  'com.apple.mobilephone', // Phone
  'com.apple.MobileSMS', // Messages
  'com.apple.mobileslideshow', // Photos
  'com.apple.camera', // Camera
  'com.apple.Maps', // Maps
  'com.apple.weather', // Weather
  'com.apple.mobiletimer', // Clock
  'com.apple.calculator', // Calculator
  'com.apple.compass', // Compass
  'com.apple.measure', // Measure
  'com.apple.Music', // Music
  'com.apple.Fitness', // Fitness
  'com.apple.news', // News
  'com.apple.stocks', // Stocks
  'com.apple.iBooks', // Books
  'com.apple.AppStore', // App Store
  'com.apple.Health', // Health
  'com.apple.Passbook', // Wallet
  'com.apple.Home', // Home
  'com.apple.findmy', // Find My
  'com.apple.shortcuts', // Shortcuts
  'com.apple.VoiceMemos', // Voice Memos
  'com.apple.mobilemail', // Mail
  'com.apple.reminders', // Reminders
  'com.apple.mobilenotes', // Notes
  'com.apple.freeform', // Freeform
  'com.apple.facetime', // FaceTime
  'com.apple.MobileAddressBook', // Contacts
  'com.apple.podcasts', // Podcasts
  'com.apple.tv', // TV
  'com.apple.DocumentsApp', // Files
  'com.apple.tips', // Tips
  'com.apple.Translate', // Translate
  'com.apple.MobileStore', // iTunes Store
  'com.apple.clips', // Clips
  'com.apple.Pages', // Pages
  'com.apple.Numbers', // Numbers
  'com.apple.Keynote', // Keynote
  'com.apple.iMovie', // iMovie
  'com.apple.garageband', // GarageBand
])

export const deviceRoutes = new Elysia({ prefix: '/devices' })
  .get('/', async () => {
    const session = await getSession()

    const [connectedResult, sessionInfo] = await Promise.all([
      device.listConnected(),
      session.getSessionInfo(),
    ])

    const connected: ConnectedDevice[] = connectedResult.success
      ? connectedResult.data
      : []
    const registeredMap = new Map<string, Omit<Device, 'udid'>>()

    if (sessionInfo.loggedIn) {
      const registered = await withSessionRetry(s => s.listDevices())
      for (const d of registered) {
        registeredMap.set(d.udid, { name: d.name, status: d.status })
      }
    }

    const connectedMap = new Map(connected.map(d => [d.udid, d]))

    const result = new Map<string, MergedDeviceInfo>()

    for (const d of connected) {
      const reg = registeredMap.get(d.udid)
      const paired = await session.validatePairing(d.udid)
      await saveDeviceMeta(d.udid, {
        name: d.name,
        productType: d.productType,
        productVersion: d.productVersion,
      })
      result.set(d.udid, {
        udid: d.udid,
        name: d.name,
        productType: d.productType,
        productVersion: d.productVersion,
        connected: true,
        registered: !!reg,
        paired,
      })
    }

    // Add registered devices not currently connected
    for (const [udid, reg] of registeredMap) {
      if (!connectedMap.has(udid)) {
        const [paired, meta] = await Promise.all([
          session.validatePairing(udid),
          getDeviceMeta(udid),
        ])
        result.set(udid, {
          udid,
          name: meta?.name ?? reg.name,
          ...(meta
            ? {
                productType: meta.productType,
                productVersion: meta.productVersion,
              }
            : {}),
          registered: true,
          connected: false,
          paired,
        })
      }
    }

    const response: DeviceListResponseItem[] = []
    for (const { paired, registered, ...rest } of result.values()) {
      response.push({
        ...rest,
        linked: paired && registered,
      })
    }
    return response
  })

  .post(
    '/:udid/link',
    async ({ params, body, set }) => {
      const session = await getSession()
      const sessionInfo = await session.getSessionInfo()

      if (!sessionInfo.loggedIn) {
        set.status = 401
        return { message: 'Apple Account sign-in required' }
      }

      const { udid } = params
      const { name } = body

      await session.pairDevice(udid)

      await withSessionRetry(async s => {
        const registered = await s.listDevices()
        const alreadyRegistered = registered.some(d => d.udid === udid)
        if (!alreadyRegistered) {
          await s.registerDevice(udid, name)
        }
      })

      const connectedResult = await device.listConnected()
      if (connectedResult.success) {
        const info = connectedResult.data.find(d => d.udid === udid)
        if (info) {
          await saveDeviceMeta(udid, {
            name: info.name,
            productType: info.productType,
            productVersion: info.productVersion,
          })
        }
      }

      return { ok: true }
    },
    { body: t.Object({ name: t.String() }) }
  )

  .get('/:udid/wda-status', ({ params }) => {
    return wdaManager.getState(params.udid)
  })

  .get('/:udid/prefs', ({ params }) => {
    return getDevicePrefs(params.udid)
  })

  .post(
    '/:udid/prefs',
    ({ params, body }) => {
      setDevicePrefs(params.udid, body)
      return getDevicePrefs(params.udid)
    },
    {
      body: t.Object({
        alwaysAwake: t.Optional(t.Boolean()),
      }),
    }
  )

  .post(
    '/:udid/wda',
    async ({ params, body, set }) => {
      const { udid } = params
      const { method, pathname, payload } = body

      // Lookup device
      const entry = deviceManager.getDevice(udid)
      if (!entry || !entry.connected) {
        set.status = 404
        return { message: 'Device not found or disconnected' }
      }

      // Resolve mainPort — auto-start WDA if needed
      let mainPort = entry.wdaState === 'ready' ? entry.mainPort : undefined

      if (!mainPort) {
        wdaManager.prepare(udid)
        try {
          await deviceManager.waitUntilReady(udid)
          const refreshed = deviceManager.getDevice(udid)
          mainPort = refreshed?.mainPort
        } catch (err) {
          set.status = 503
          return {
            message: err instanceof Error ? err.message : 'WDA failed to start',
          }
        }
        if (!mainPort) {
          set.status = 503
          return { message: 'WDA started but mainPort is unavailable' }
        }
      }

      // Proxy the request to WDA
      try {
        const wdaUrl = `http://localhost:${mainPort}${pathname}`
        const init: RequestInit = { method }
        if (payload !== undefined && method !== 'GET') {
          init.body = JSON.stringify(payload)
          init.headers = { 'Content-Type': 'application/json' }
        }
        const resp = await fetch(wdaUrl, init)
        const data = await resp.json()
        set.status = resp.status
        return data
      } catch (err) {
        set.status = 502
        return {
          message: `Failed to reach WDA: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
    {
      body: t.Object({
        method: t.Union([
          t.Literal('GET'),
          t.Literal('POST'),
          t.Literal('DELETE'),
        ]),
        pathname: t.String({ pattern: '^/' }),
        payload: t.Optional(t.Unknown()),
      }),
    }
  )

  .get('/:udid/apps', async ({ params, set }) => {
    const { udid } = params
    const [userResult, systemResult] = await Promise.all([
      apps.listInstalledApps(udid, 'User'),
      apps.listInstalledApps(udid, 'System'),
    ])
    if (!userResult.success) {
      set.status = 500
      return { message: userResult.error.message }
    }

    const systemApps = systemResult.success
      ? systemResult.data.filter(app => VISIBLE_SYSTEM_APPS.has(app.bundleId))
      : []

    const config = await getConfig()
    const wdaBundleId = config.wda.bundleId
    const allApps = [...userResult.data, ...systemApps]
    const filtered = allApps.filter(
      app => !wdaBundleId || !app.bundleId.startsWith(wdaBundleId)
    )

    const lookups = filtered.map(async app => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(app.bundleId)}`
        )
        const json = (await res.json()) as {
          resultCount: number
          results: Array<{
            trackName?: string
            artworkUrl60?: string
            artworkUrl100?: string
          }>
        }
        const hit = json.resultCount > 0 ? json.results[0] : undefined
        return {
          bundleId: app.bundleId,
          name: app.bundleName ?? hit?.trackName ?? app.bundleId,
          iconUrl60: hit?.artworkUrl60,
          iconUrl100: hit?.artworkUrl100,
        }
      } catch {
        return {
          bundleId: app.bundleId,
          name: app.bundleName ?? app.bundleId,
        }
      }
    })

    const settled = await Promise.allSettled(lookups)
    return settled
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          bundleId: string
          name: string
          iconUrl60?: string
          iconUrl100?: string
        }> => r.status === 'fulfilled'
      )
      .map(r => r.value)
  })

  .get('/:udid/screen', async ({ params, set }) => {
    const { udid } = params

    // Check if DeviceManager already has this device ready
    const entry = deviceManager.getDevice(udid)
    let mjpegPort: number | undefined =
      entry?.wdaState === 'ready' ? entry.mjpegPort : undefined

    if (!mjpegPort) {
      // Fallback: trigger WDA prepare and wait
      wdaManager.prepare(udid)
      try {
        mjpegPort = await deviceManager.waitUntilReady(udid)
      } catch (err) {
        set.status = 503
        return {
          message: err instanceof Error ? err.message : 'WDA failed to start',
        }
      }
    }

    const upstream = await fetch(`http://localhost:${mjpegPort}`)
    return new Response(upstream.body, {
      headers: {
        'Content-Type':
          upstream.headers.get('Content-Type') ?? 'multipart/x-mixed-replace',
        'Cache-Control': 'no-cache',
      },
    })
  })
