import { Elysia, t } from 'elysia'

import { device } from '@tachibana/ios-connect'
import type { ConnectedDevice } from '@tachibana/ios-connect'

import { getSession } from '../libs/session.ts'

export const deviceRoutes = new Elysia({ prefix: '/devices' })
  .get('/', async () => {
    const session = await getSession()

    const [connectedResult, sessionInfo] = await Promise.all([
      device.listConnected(),
      session.getSessionInfo(),
    ])

    const connected: ConnectedDevice[] = connectedResult.success ? connectedResult.data : []
    const registeredMap = new Map<string, { name: string; status: string }>()

    if (sessionInfo.loggedIn) {
      const registered = await session.listDevices()
      for (const d of registered) {
        registeredMap.set(d.udid, { name: d.name, status: d.status })
      }
    }

    const connectedMap = new Map(connected.map((d) => [d.udid, d]))

    const result = new Map<
      string,
      {
        udid: string
        name: string
        productType?: string
        productVersion?: string
        status?: string
        connected: boolean
        linked: boolean
      }
    >()

    for (const d of connected) {
      const reg = registeredMap.get(d.udid)
      result.set(d.udid, {
        udid: d.udid,
        name: d.name,
        productType: d.productType,
        productVersion: d.productVersion,
        status: reg?.status,
        connected: true,
        linked: registeredMap.has(d.udid),
      })
    }

    // Add registered devices not currently connected
    for (const [udid, reg] of registeredMap) {
      if (!connectedMap.has(udid)) {
        result.set(udid, {
          udid,
          name: reg.name,
          status: reg.status,
          connected: false,
          linked: true,
        })
      }
    }

    return Array.from(result.values())
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

      try {
        await session.pairDevice(udid)
        await session.registerDevice(udid, name)
      } catch (err) {
        set.status = 500
        return { message: err instanceof Error ? err.message : String(err) }
      }

      return { ok: true }
    },
    { body: t.Object({ name: t.String() }) }
  )
