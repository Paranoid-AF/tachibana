import { Elysia, t } from 'elysia'

import { join } from 'path'

import { device, photos } from '@tbana/ios-connect'
import type { ConnectedDevice, Device } from '@tbana/ios-connect'

import { getSession } from '../libs/session.ts'
import { withSessionRetry } from '../libs/session-guard.ts'
import {
  getDeviceMeta,
  saveDeviceMeta,
  getDevicePrefs,
  setDevicePrefs,
} from '../libs/device-store.ts'
import { wdaManager } from '../libs/wda-manager.ts'
import { ensureWdaPorts, getFilteredApps, downloadPhotoToCache, ensureCompatibleImage } from '../libs/idevice-utils.ts'
import { MEDIA_MIME_TYPES } from '../consts/idevice.ts'

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

      let mainPort: number
      try {
        ;({ mainPort } = await ensureWdaPorts(udid))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'WDA failed to start'
        set.status = msg.includes('not found') ? 404 : 503
        return { message: msg }
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
    let filtered: Array<{ bundleId: string; bundleName: string | null }>
    try {
      filtered = await getFilteredApps(udid)
    } catch (err) {
      set.status = 500
      return { message: err instanceof Error ? err.message : 'Failed to list apps' }
    }

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

  .get('/:udid/photos', async ({ params, query, set }) => {
    const { udid } = params
    const limit = Number(query.limit ?? '50')
    const cursor = query.cursor as string | undefined

    const listResult = await photos.listPhotos(udid, {
      limit,
      cursor: cursor || undefined,
    })
    if (!listResult.success) {
      set.status = 500
      return { message: listResult.error.message }
    }

    const { photos: paths, nextCursor } = listResult.data
    const infoResults = await Promise.allSettled(
      paths.map(async p => {
        const info = await photos.getPhotoInfo(udid, p)
        if (!info.success) throw new Error(info.error.message)
        return { path: p, size: info.data.size, modified: info.data.modified }
      })
    )

    const entries = infoResults
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          path: string
          size: number
          modified: number
        }> => r.status === 'fulfilled'
      )
      .map(r => r.value)

    return {
      photos: entries,
      nextCursor: nextCursor ?? undefined,
    }
  })

  .get('/:udid/photos/file', async ({ params, query, set }) => {
    const { udid } = params
    const remotePath = query.path as string | undefined
    const preview = query.preview === 'true'

    if (!remotePath) {
      set.status = 400
      return { message: 'Missing required query param: path' }
    }

    let localPath: string
    let ext: string
    try {
      ;({ localPath, ext } = await downloadPhotoToCache(udid, remotePath))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      set.status = msg.includes('Only /DCIM/') ? 403 : 500
      return { message: msg }
    }

    // Convert HEIC to JPEG for browser preview
    const { filePath, mimeExt } = preview
      ? await ensureCompatibleImage(localPath, ext)
      : { filePath: localPath, mimeExt: ext }

    const contentType = MEDIA_MIME_TYPES[mimeExt] ?? 'application/octet-stream'

    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  })

  .get('/:udid/screen', async ({ params, set }) => {
    const { udid } = params

    let mjpegPort: number | undefined
    try {
      ;({ mjpegPort } = await ensureWdaPorts(udid))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WDA failed to start'
      set.status = msg.includes('not found') ? 404 : 503
      return { message: msg }
    }

    if (!mjpegPort) {
      set.status = 503
      return { message: 'WDA started but mjpegPort is unavailable' }
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
