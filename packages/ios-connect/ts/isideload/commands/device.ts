import type { SideloaderOptions, SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'
import type { ConnectedDevice } from '../native.ts'
import { getSession } from '../session.ts'
import { ensureSession } from './auth.ts'

export type { ConnectedDevice }

/** Register a device with Apple Developer portal */
export async function register(
  udid: string,
  name: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    await session.registerDevice(udid, name, options?.teamId)
    return { success: true, data: 'Device registered' }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/** List devices registered in Apple Developer portal */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    const devices = await session.listDevices(options?.teamId)
    return {
      success: true,
      data: devices.map(d => `${d.udid} - ${d.name}`).join('\n'),
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/** List USB-connected devices (no auth required) */
export async function listConnected(): Promise<
  SideloaderResult<ConnectedDevice[]>
> {
  try {
    const native = getNative()
    const devices = await native.listConnectedDevices()
    return { success: true, data: devices }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/** Backward-compatible alias for listConnected() */
export async function listDetailed(): Promise<
  SideloaderResult<ConnectedDevice[]>
> {
  return listConnected()
}

/**
 * Pair this host with a USB-connected device.
 * Triggers the "Trust This Computer?" dialog on the device.
 */
export async function pairDevice(
  udid: string
): Promise<SideloaderResult<{ paired: boolean }>> {
  try {
    const session = getSession()
    const paired = await session.pairDevice(udid)
    return { success: true, data: { paired } }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/**
 * Check whether a USB-connected device has a pairing record stored in usbmuxd.
 */
export async function validatePairing(
  udid: string
): Promise<SideloaderResult<{ paired: boolean }>> {
  try {
    const session = getSession()
    const paired = await session.validatePairing(udid)
    return { success: true, data: { paired } }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
