import { Elysia, t } from 'elysia'

import { device } from '@tbana/ios-connect'
import type { ConnectedDevice, Device } from '@tbana/ios-connect'

import { getSession } from '../libs/session.ts'
import { getDeviceMeta, saveDeviceMeta } from '../libs/deviceStore.ts'

export interface MergedDeviceInfo extends Omit<
  Partial<ConnectedDevice> & Device,
  'status'
> {
  paired: boolean
  connected: boolean
  registered: boolean
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
      const registered = await session.listDevices()
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

      await session.pairDevice(udid)

      const registered = await session.listDevices()
      const alreadyRegistered = registered.some(d => d.udid === udid)
      if (!alreadyRegistered) {
        await session.registerDevice(udid, name)
      }

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
