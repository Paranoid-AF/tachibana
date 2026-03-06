import type { SideloaderOptions, SideloaderResult } from '../../types.ts'
import { getDaemon } from '../daemon.ts'
import { ensureSession } from './auth.ts'

export interface ConnectedDevice {
  udid: string
  name: string
  productType: string
  productVersion: string
}

/** Register a device with Apple Developer portal */
export async function register(
  udid: string,
  name: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const daemon = await getDaemon()
    await daemon.request('registerDevice', { udid, name })
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

    const daemon = await getDaemon()
    const result = await daemon.request<{
      devices: Array<{ udid: string; name: string }>
    }>('listDevices', {})
    return {
      success: true,
      data: result.devices.map(d => `${d.udid} - ${d.name}`).join('\n'),
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

/** List USB-connected devices (via idevice crate, no auth required) */
export async function listConnected(): Promise<
  SideloaderResult<ConnectedDevice[]>
> {
  try {
    const daemon = await getDaemon()
    const result = await daemon.request<{ devices: ConnectedDevice[] }>(
      'listConnectedDevices'
    )
    return { success: true, data: result.devices }
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
 * List USB-connected devices with detailed info.
 * Backward-compatible alias for listConnected().
 */
export async function listDetailed(): Promise<
  SideloaderResult<ConnectedDevice[]>
> {
  return listConnected()
}
