import { Elysia, t } from 'elysia'

import { device } from '@tbana/ios-connect'
import type { ConnectedDevice, Device } from '@tbana/ios-connect'

import { getSession } from '../libs/session.ts'
import { withSessionRetry } from '../libs/session-guard.ts'
import { getDeviceMeta, saveDeviceMeta } from '../libs/device-store.ts'
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

      await withSessionRetry(async (s) => {
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
        method: t.Union([t.Literal('GET'), t.Literal('POST'), t.Literal('DELETE')]),
        pathname: t.String({ pattern: '^/' }),
        payload: t.Optional(t.Unknown()),
      }),
    }
  )

  .get('/:udid/screen', async ({ params, set }) => {
    const { udid } = params

    // Check if DeviceManager already has this device ready
    const entry = deviceManager.getDevice(udid)
    let mjpegPort: number | undefined = entry?.wdaState === 'ready' ? entry.mjpegPort : undefined

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
